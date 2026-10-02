import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession, writeSession } from './_lib/session.js';
import {
  downloadFileText,
  ensureFreshAccessToken,
  findApoloFolder,
  findFilesByNamePrefix,
  findSubfoldersByName,
  listFilesInFolder,
} from './_lib/google.js';
import { mapearComLimite, montarPainel } from './_lib/painel-sadt.js';
import { pastaDoMes } from './_lib/sadt.js';

export const config = { maxDuration: 60 };

const NOME_LIVRO = '_faturamento.json';

/** JSON do Drive; null quando não abre (o painel mostra como registro ilegível). */
async function baixarJson(accessToken: string, arquivo: { id: string; name: string }): Promise<unknown> {
  try {
    return JSON.parse((await downloadFileText(accessToken, arquivo.id)).replace(/^\uFEFF/, ''));
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

    const raizes = await findSubfoldersByName(accessToken, apoloId, '_SADT');
    const pastasDoMes = (
      await Promise.all(raizes.map((raiz) => findSubfoldersByName(accessToken, raiz.id, pastaDoMes(`${mes}-01`))))
    ).flat();
    const arquivos = (await Promise.all(pastasDoMes.map((p) => listFilesInFolder(accessToken, p.id)))).flat();

    const arquivosDeRegistro = arquivos.filter((a) => /\.json$/i.test(a.name) && !a.name.startsWith('_'));
    const arquivoDoLivro = arquivos.find((a) => a.name === NOME_LIVRO);

    const [registros, livro, pdfs] = await Promise.all([
      mapearComLimite(arquivosDeRegistro, 8, async (a) => ({ nome: a.name, conteudo: await baixarJson(accessToken, a) })),
      // Livro que existe mas não abre não pode virar "sem livro" (tudo como "falta
      // faturar", R$ 0): um objeto inválido faz montarPainel mostrar o aviso do livro.
      arquivoDoLivro
        ? baixarJson(accessToken, arquivoDoLivro).then((livro) => livro ?? { livroIlegivel: true })
        : Promise.resolve(null),
      findFilesByNamePrefix(accessToken, 'Guia_SADT_', 'application/pdf'),
    ]);

    return res.status(200).json(
      montarPainel({
        mes,
        registros,
        livro,
        pdfs: pdfs.map((p) => ({ id: p.id, nome: p.name, link: p.webViewLink ?? null })),
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[sadt] error:', message);
    return res.status(500).json({ error: 'painel_failed', message });
  }
}
