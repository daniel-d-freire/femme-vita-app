// api/anexos.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession, writeSession } from './_lib/session.js';
import { downloadFileText, ensureFreshAccessToken, findApoloFolder, findSubfoldersByName, listFilesInFolder } from './_lib/google.js';
import { montarPainelAnexos, pastaDoMesAnexos } from './_lib/painel-anexos.js';

export const config = { maxDuration: 30 };

const NOME_REGISTRO = '_anexos.json';

/** JSON do Drive; null quando não abre (o painel mostra o aviso de registro ilegível). */
async function baixarJson(accessToken: string, arquivo: { id: string; name: string }): Promise<unknown> {
  try {
    return JSON.parse((await downloadFileText(accessToken, arquivo.id)).replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const mes = typeof req.query?.mes === 'string' ? req.query.mes : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return res.status(400).json({ error: 'invalid_month', message: 'Mês no formato AAAA-MM.' });
  }

  try {
    const accessToken = await ensureFreshAccessToken(session);
    let apoloFolderId = session.apoloFolderId;
    if (!apoloFolderId) {
      const apolo = await findApoloFolder(accessToken);
      if (!apolo) {
        return res.status(404).json({ error: 'apolo_not_found', message: 'Pasta "Apolo" não encontrada no seu Drive.' });
      }
      apoloFolderId = apolo.id;
      session.apoloFolderId = apoloFolderId;
    }
    writeSession(res, session);
    const apoloId: string = apoloFolderId;

    const raizes = await findSubfoldersByName(accessToken, apoloId, '_ANEXOS');
    const pastas = (await Promise.all(raizes.map((r) => findSubfoldersByName(accessToken, r.id, pastaDoMesAnexos(mes))))).flat();
    const arquivos = (await Promise.all(pastas.map((p) => listFilesInFolder(accessToken, p.id)))).flat();
    const registros = await Promise.all(arquivos.filter((a) => a.name === NOME_REGISTRO).map((a) => baixarJson(accessToken, a)));

    return res.status(200).json(montarPainelAnexos({ mes, registros }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[anexos] error:', message);
    return res.status(500).json({ error: 'painel_failed', message });
  }
}
