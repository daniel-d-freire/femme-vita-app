import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSession } from '../_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  clearSession(res);
  if (req.method === 'GET') {
    res.setHeader('Location', '/');
    return res.status(302).end();
  }
  return res.status(200).json({ ok: true });
}
