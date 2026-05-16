import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession } from '../_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  return res.status(200).json({
    authenticated: true,
    user: session.user,
    apoloFolderResolved: Boolean(session.apoloFolderId),
  });
}
