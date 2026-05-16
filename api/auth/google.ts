import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  findApoloFolder,
} from '../_lib/google.js';
import { writeSession, type SessionData } from '../_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const url = new URL(req.url!, `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // No code yet — start the OAuth flow.
  if (!code && !error) {
    try {
      const state = Math.random().toString(36).slice(2);
      const authUrl = buildAuthorizationUrl(state);
      res.setHeader('Location', authUrl);
      return res.status(302).end();
    } catch (err) {
      return res.status(500).send(renderErrorPage((err as Error).message));
    }
  }

  if (error) {
    return res.status(400).send(renderErrorPage(`Google retornou erro: ${error}`));
  }

  try {
    const tokens = await exchangeCodeForTokens(code!);
    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send(
          renderErrorPage(
            'Google não devolveu refresh_token. Isso costuma acontecer quando você já autorizou o app antes. Vá em https://myaccount.google.com/permissions, remova "Femme Vita Arquivo", e tente logar de novo.'
          )
        );
    }

    const userInfo = await getUserInfo(tokens.access_token);
    const session: SessionData = {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000 - 30_000,
      user: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    };

    // Pre-resolve the Apolo folder so subsequent requests are cheaper.
    try {
      const apolo = await findApoloFolder(tokens.access_token);
      if (apolo) session.apoloFolderId = apolo.id;
    } catch {
      // non-fatal — folder lookup can happen later
    }

    writeSession(res, session);
    res.setHeader('Location', '/');
    return res.status(302).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro desconhecido';
    return res.status(500).send(renderErrorPage(message));
  }
}

function renderErrorPage(message: string): string {
  const safe = message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Erro no login</title><style>
body{font-family:system-ui;padding:2rem;max-width:480px;margin:auto;color:#0E2A4E;background:#F4F2EC}
h1{font-style:italic;font-weight:400}
.msg{background:#fff;padding:1rem;border-radius:8px;border:1px solid rgba(14,42,78,0.1);font-size:14px;line-height:1.5}
a{display:inline-block;margin-top:1rem;padding:0.75rem 1rem;background:#0E2A4E;color:#F4F2EC;border-radius:8px;text-decoration:none}
</style></head><body><h1>Não consegui fazer login</h1><div class="msg">${safe}</div><a href="/">← Voltar</a></body></html>`;
}
