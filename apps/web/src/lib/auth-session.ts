import { getServerUrl } from './socket';

export interface GuestSessionUser {
  id: string;
  username: string;
  isGuest: boolean;
}

export async function ensureGuestSession(username?: string): Promise<GuestSessionUser> {
  const response = await fetch(`${getServerUrl()}/api/auth/guest`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(username ? { username } : {})
  });

  if (!response.ok) {
    throw new Error('guest_session_failed');
  }

  const body = (await response.json()) as { ok: boolean; user: GuestSessionUser };
  if (!body.ok) {
    throw new Error('guest_session_failed');
  }

  return body.user;
}
