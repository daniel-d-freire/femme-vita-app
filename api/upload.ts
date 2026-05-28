import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { readSession, writeSession } from './_lib/session.js';
import {
  ensureFreshAccessToken,
  findApoloFolder,
  findOrCreateSubfolder,
  uploadFileToDrive,
} from './_lib/google.js';
import { buildPdfFromDataUrls } from './_lib/pdf.js';

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
});

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

  try {
    const accessToken = await ensureFreshAccessToken(session);

    // Resolve Apolo folder id (needed only for _Pendentes case).
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

    // Resolve the target folder.
    let targetFolderId: string;
    let targetFolderName: string;
    let wasPendente = false;

    if (parsed.data.target.kind === 'folderId') {
      targetFolderId = parsed.data.target.folderId;
      targetFolderName = '(matched)';
    } else {
      // Create or find Apolo/_Pendentes/<patientName>/
      const pendentesRoot = await findOrCreateSubfolder(accessToken, apoloFolderId, '_Pendentes');
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
    const uploaded = await uploadFileToDrive(
      accessToken,
      targetFolderId,
      parsed.data.fileName,
      'application/pdf',
      pdfBytes
    );
    const uploadedAt = Date.now();

    return res.status(200).json({
      ok: true,
      fileId: uploaded.id,
      fileName: uploaded.name,
      webViewLink: uploaded.webViewLink,
      folderId: targetFolderId,
      folderName: targetFolderName,
      wasPendente,
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
