import type { SessionData } from './session.js';

const OAUTH_AUTHZ_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export function getOAuthCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_REDIRECT_URI não configurada.');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTHZ_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha no exchange do código OAuth: ${response.status} ${text}`);
  }
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha no refresh do token: ${response.status} ${text}`);
  }
  const data = (await response.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000, // 30s safety margin
  };
}

export async function getUserInfo(accessToken: string): Promise<{ email: string; name?: string; picture?: string }> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao obter userinfo: ${response.status}`);
  }
  return (await response.json()) as { email: string; name?: string; picture?: string };
}

/**
 * Ensures the session has a fresh access token. Mutates the session in place
 * if refresh was needed. Returns the access token to use right now.
 */
export async function ensureFreshAccessToken(session: SessionData): Promise<string> {
  if (session.expiresAt > Date.now()) {
    return session.accessToken;
  }
  const refreshed = await refreshAccessToken(session.refreshToken);
  session.accessToken = refreshed.accessToken;
  session.expiresAt = refreshed.expiresAt;
  return refreshed.accessToken;
}

export type DriveFolder = {
  id: string;
  name: string;
  parents?: string[];
};

export async function findApoloFolder(accessToken: string): Promise<DriveFolder | null> {
  const params = new URLSearchParams({
    q: "name='Apolo' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name,parents)',
    pageSize: '10',
  });
  const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao buscar pasta Apolo: ${response.status}`);
  }
  const data = (await response.json()) as { files: DriveFolder[] };
  if (data.files.length === 0) return null;
  // Prefer the one at root level (parents includes the root)
  // For simplicity, just return the first match.
  return data.files[0];
}

export async function listSubfolders(
  accessToken: string,
  parentId: string,
  pageSize = 1000
): Promise<DriveFolder[]> {
  const all: DriveFolder[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: String(pageSize),
      orderBy: 'name',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Falha ao listar subpastas: ${response.status}`);
    }
    const data = (await response.json()) as { files: DriveFolder[]; nextPageToken?: string };
    all.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}
