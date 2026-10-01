import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { readSession, writeSession } from './_lib/session.js';
import {
  ensureFreshAccessToken,
  findApoloFolder,
  findOrCreateSubfolder,
  listFileNamesInFolder,
  uploadFileToDrive,
} from './_lib/google.js';
import { buildPdfFromDataUrls } from './_lib/pdf.js';
import {
  SadtUploadSchema,
  montarRegistro,
  nomeCombinaComData,
  nomeDoRegistro,
  nomePdfDoRegistro,
  nomeSadtValido,
  nomeSemColisao,
  pastaDoMes,
  tentarAte,
  type RegistroSadt,
} from './_lib/sadt.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
  maxDuration: 60,
};

const RequestBodySchema = z.object({
  images: z.array(z.string().startsWith('data:image/')).min(1).max(10),
  fileName: z.string().min(3).max(200),
  /** Either a known folder id (matched patient) or a name for `_Pendentes/<Name>`. */
  target: z.union([
    z.object({ kind: z.literal('folderId'), folderId: z.string() }),
    z.object({ kind: z.literal('pendente'), patientName: z.string().min(1) }),
  ]),
  /** Presente só no modo SADT: grava também o registro em Apolo/_SADT/<AAAA.MM>/. */
  sadt: SadtUploadSchema.optional(),
});

/**
 * Registro da guia SADT para o robô de faturamento (spec, seção 9). Idempotente:
 * se uma tentativa anterior gravou e só a resposta se perdeu, não grava de novo
 * (dois registros com o mesmo nome confundiriam a chave do livro do robô).
 */
async function gravarRegistro(accessToken: string, pastaDoMesId: string, registro: RegistroSadt): Promise<void> {
  const nome = nomeDoRegistro(registro.pdf.nome);
  if ((await listFileNamesInFolder(accessToken, pastaDoMesId)).includes(nome)) return;
  const bytes = new TextEncoder().encode(JSON.stringify(registro, null, 2));
  await uploadFileToDrive(accessToken, pastaDoMesId, nome, 'application/json', bytes);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const parsed = RequestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_body',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const sadt = parsed.data.sadt;
  if (sadt && (!nomeSadtValido(parsed.data.fileName) || !nomeCombinaComData(parsed.data.fileName, sadt.data))) {
    return res.status(400).json({
      error: 'invalid_sadt_name',
      message: 'Nome de guia SADT fora do padrão Guia_SADT_<Paciente>_<AAAA.MM.DD>.pdf, ou com data diferente da guia.',
    });
  }

  try {
    const accessToken = await ensureFreshAccessToken(session);

    // Resolve Apolo folder id (needed for _Pendentes and for the SADT registro).
    let apoloFolderId = session.apoloFolderId;
    if (!apoloFolderId) {
      const apolo = await findApoloFolder(accessToken);
      if (!apolo) {
        return res.status(404).json({
          error: 'apolo_not_found',
          message: 'Pasta "Apolo" não encontrada no seu Drive.',
        });
      }
      apoloFolderId = apolo.id;
      session.apoloFolderId = apoloFolderId;
    }
    const apoloId: string = apoloFolderId;

    // Resolve the target folder.
    let targetFolderId: string;
    let targetFolderName: string;
    let wasPendente = false;

    if (parsed.data.target.kind === 'folderId') {
      targetFolderId = parsed.data.target.folderId;
      targetFolderName = '(matched)';
    } else {
      // Create or find Apolo/_Pendentes/<patientName>/
      const pendentesRoot = await findOrCreateSubfolder(accessToken, apoloId, '_Pendentes');
      const patientFolder = await findOrCreateSubfolder(
        accessToken,
        pendentesRoot.id,
        parsed.data.target.patientName
      );
      targetFolderId = patientFolder.id;
      targetFolderName = `_Pendentes / ${patientFolder.name}`;
      wasPendente = true;
    }

    // Persist the (possibly refreshed) tokens.
    writeSession(res, session);

    // Build PDF and upload.
    const startedAt = Date.now();
    const pdfBytes = await buildPdfFromDataUrls(parsed.data.images);
    const pdfBuiltAt = Date.now();

    let fileName = parsed.data.fileName;
    let pastaDoMesId: string | null = null;
    if (sadt) {
      const raiz = await findOrCreateSubfolder(accessToken, apoloId, '_SADT');
      const mes = await findOrCreateSubfolder(accessToken, raiz.id, pastaDoMes(sadt.data));
      pastaDoMesId = mes.id;
      const [naPasta, noMes] = await Promise.all([
        listFileNamesInFolder(accessToken, targetFolderId),
        listFileNamesInFolder(accessToken, mes.id),
      ]);
      // O nome do registro é a chave do livro do robô: tem de ser único também em
      // _SADT/<mês>, e não só na pasta da paciente (pasta casada e _Pendentes podem
      // gerar o mesmo nome).
      fileName = nomeSemColisao(fileName, [...naPasta, ...noMes.map(nomePdfDoRegistro)]);
    }

    const uploaded = await uploadFileToDrive(
      accessToken,
      targetFolderId,
      fileName,
      'application/pdf',
      pdfBytes
    );
    const uploadedAt = Date.now();

    // O PDF já está salvo; o registro tenta 3 vezes e, se falhar, a tela avisa.
    let registroFalhou = false;
    if (sadt && pastaDoMesId) {
      const mesId = pastaDoMesId;
      const registro = montarRegistro({
        sadt,
        pdf: { id: uploaded.id, nome: uploaded.name },
        pendente: wasPendente,
        email: session.user.email,
        agora: new Date(),
      });
      registroFalhou = !(await tentarAte(3, 500, () => gravarRegistro(accessToken, mesId, registro)));
    }

    return res.status(200).json({
      ok: true,
      fileId: uploaded.id,
      fileName: uploaded.name,
      webViewLink: uploaded.webViewLink,
      folderId: targetFolderId,
      folderName: targetFolderName,
      wasPendente,
      renomeado: fileName !== parsed.data.fileName,
      registroFalhou,
      sizeKb: Math.round(pdfBytes.byteLength / 1024),
      timing: {
        pdfMs: pdfBuiltAt - startedAt,
        uploadMs: uploadedAt - pdfBuiltAt,
        totalMs: uploadedAt - startedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[upload] error:', message);
    return res.status(500).json({ error: 'upload_failed', message });
  }
}
