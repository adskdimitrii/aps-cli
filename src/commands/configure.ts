import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { userInfo } from 'node:os';
import { saveCredentials, loadCredentials, saveToken, clearToken, clearSsaData, saveSsaData } from '../lib/auth.ts';

const AUTH_TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
const SSA_BASE_URL = 'https://developer.api.autodesk.com/authentication/v2/service-accounts';

export async function configure(
  clientId: string | undefined,
  clientSecret: string | undefined,
  tokenPath?: string,
): Promise<void> {
  const existing = loadCredentials();

  const resolved = {
    client_id: clientId ?? existing?.client_id ?? '',
    client_secret: clientSecret ?? existing?.client_secret ?? '',
  };

  if (!resolved.client_id) {
    console.error('Error: --client-id is required.');
    process.exit(1);
  }
  if (!resolved.client_secret) {
    console.error('Error: --client-secret is required.');
    process.exit(1);
  }

  saveCredentials(resolved);
  console.log('Credentials saved to ~/.config/aps-cli/credentials.json');

  if (tokenPath) {
    let tokenJson: Record<string, unknown>;
    try {
      tokenJson = JSON.parse(readFileSync(tokenPath, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      console.error(`Error: Could not read token file at "${tokenPath}": ${(err as Error).message}`);
      process.exit(1);
    }

    if (typeof tokenJson['access_token'] !== 'string' || typeof tokenJson['refresh_token'] !== 'string') {
      console.error('Error: Token file must contain "access_token" and "refresh_token" string fields.');
      process.exit(1);
    }

    const credentials = Buffer.from(`${resolved.client_id}:${resolved.client_secret}`).toString('base64');
    const res = await fetch(AUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenJson['refresh_token'],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Error: Token refresh failed (${res.status}): ${body}`);
      process.exit(1);
    }

    const refreshed = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    saveToken(refreshed);
    console.log('Token imported and refreshed.');
  }
}

export async function configureSsa(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<void> {
  if (!clientId) {
    console.error('Error: --client-id is required.');
    process.exit(1);
  }
  if (!clientSecret) {
    console.error('Error: --client-secret is required.');
    process.exit(1);
  }

  // 1. Clear any existing token and SSA data
  clearToken();
  clearSsaData();

  // Save credentials so subsequent auth calls can use them
  saveCredentials({ client_id: clientId, client_secret: clientSecret });
  console.log('Credentials saved.');

  // 2. Get a 2-legged token with SSA scopes
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'application:service_account:read application:service_account:write application:service_account_key:write',
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error(`Error: Failed to obtain access token (${tokenRes.status}): ${body}`);
    process.exit(1);
  }

  const { access_token } = await tokenRes.json() as { access_token: string };

  // 3. Create the service account
  const name = `svc-aps-cli-${randomBytes(4).toString('hex')}`;
  const firstName = (() => {
    try {
      const username = userInfo().username.trim();
      return username || 'service';
    } catch {
      return 'service';
    }
  })();
  const createRes = await fetch(SSA_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ name, firstName, lastName: 'aps-cli' }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    console.error(`Error: Failed to create service account (${createRes.status}): ${body}`);
    process.exit(1);
  }

  const { serviceAccountId, email } = await createRes.json() as {
    serviceAccountId: string;
    email: string;
  };

  // 4. Create an RSA key pair for the service account
  const keyRes = await fetch(`${SSA_BASE_URL}/${serviceAccountId}/keys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  });

  if (!keyRes.ok) {
    const body = await keyRes.text();
    console.error(`Error: Failed to create service account key (${keyRes.status}): ${body}`);
    process.exit(1);
  }

  const { kid, privateKey } = await keyRes.json() as { kid: string; privateKey: string };

  // 5. Persist the SSA data (encrypted)
  saveSsaData({ serviceAccountId, email, kid, privateKey });

  console.log(`\nSSA configured successfully.`);
  console.log(`\nService account email:\n  ${email}`);
  console.log(`\nNext step: grant this email address access to your Forma/ACC resources.`);
  console.log(`The account administrator can add it as a member in Autodesk Construction Cloud or Forma.`);
}
