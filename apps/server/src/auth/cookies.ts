export const DEFAULT_AUTH_COOKIE_NAME = 'aipoker_session';

export function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!cookieHeader) {
    return parsed;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (!rawName || rawValueParts.length === 0) {
      continue;
    }
    const value = rawValueParts.join('=');
    try {
      parsed.set(rawName, decodeURIComponent(value));
    } catch {
      parsed.set(rawName, value);
    }
  }

  return parsed;
}
