import { clearToken, loadToken } from '../lib/auth.ts';

export function logout(): void {
  if (loadToken()) {
    clearToken();
    console.log('Logged out. Token removed.');
  } else {
    console.log('Not logged in.');
  }
}
