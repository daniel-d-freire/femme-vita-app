import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession, writeSession } from './_lib/session.js';
import { ensureFreshAccessToken, findApoloFolder, listSubfolders } from './_lib/google.js';

type CacheEntry = {
  apoloFolderId: string;
  folders: { id: string; name: string }[];
  fetchedAt: number;
};

// Cheap in-memory cache (warm functions only). 5 min TTL.
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  try {
    const accessToken = await ensureFreshAccessToken(session);

    let apoloFolderId = session.apoloFolderId;
    if (!apoloFolderId) {
      const folder = await findApoloFolder(accessToken);
      if (!folder) {
        return res.status(404).json({
          error: 'apolo_not_found',
          message: 'Não encontrei uma pasta chamada "Apolo" no seu Drive.',
        });
      }
      apoloFolderId = folder.id;
      session.apoloFolderId = apoloFolderId;
    }

    // Re-write session in case access_token was refreshed or apoloFolderId was just resolved.
    writeSession(res, session);

    const cacheKey = `${session.user.email}::${apoloFolderId}`;
    const reload = req.query?.reload === '1';
    const cached = CACHE.get(cacheKey);
    if (!reload && cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return res.status(200).json({
        apoloFolderId: cached.apoloFolderId,
        folders: cached.folders,
        cached: true,
      });
    }

    const folders = await listSubfolders(accessToken, apoloFolderId);
    const trimmed = folders.map((f) => ({ id: f.id, name: f.name }));
    CACHE.set(cacheKey, { apoloFolderId, folders: trimmed, fetchedAt: Date.now() });

    return res.status(200).json({
      apoloFolderId,
      folders: trimmed,
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[folders] error:', message);
    return res.status(500).json({ error: 'folders_failed', message });
  }
}
