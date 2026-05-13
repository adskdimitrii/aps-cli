import * as http from 'node:http';
import { getCredential, saveToken } from '../lib/auth.ts';

const AUTH_BASE = 'https://developer.api.autodesk.com/authentication/v2';
const SCOPE = 'data:read';

export async function login(): Promise<void> {
  const clientId = getCredential('APS_CLIENT_ID');
  const clientSecret = getCredential('APS_CLIENT_SECRET');
  const redirectUri = process.env['APS_REDIRECT_URI'] ?? 'http://localhost:7482/callback';

  const port = parseInt(new URL(redirectUri).port || '80');

  const authUrl =
    `${AUTH_BASE}/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
    }).toString();

  console.log('Open this URL in your browser to authenticate:\n');
  console.log(`  ${authUrl}\n`);
  console.log(`Waiting for callback on port ${port}...`);

  const code = await waitForCallback(port);

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const tokenData = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  saveToken(tokenData);
  console.log('Login successful. Token saved.');
}

function waitForCallback(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p>Authorization failed. You may close this tab.</p>');
        server.close();
        reject(new Error(`Authorization error: ${error}`));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p>No authorization code received. You may close this tab.</p>');
        server.close();
        reject(new Error('No authorization code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<p>Authentication successful. You may close this tab.</p>');
      server.close();
      resolve(code);
    });

    server.on('error', reject);
    server.listen(port);
  });
}
