import { PDFDocument } from 'pdf-lib';

const A4_WIDTH = 595.28; // points
const A4_HEIGHT = 841.89;

/**
 * Builds a single PDF from one or more image data URLs.
 * Each image becomes one A4 page, aspect-ratio preserved, centered.
 */
export async function buildPdfFromDataUrls(dataUrls: string[]): Promise<Uint8Array> {
  if (dataUrls.length === 0) throw new Error('Nenhuma imagem para o PDF.');

  const doc = await PDFDocument.create();
  doc.setProducer('Femme Vita Arquivo');
  doc.setCreator('Femme Vita Arquivo');
  doc.setCreationDate(new Date());

  for (const url of dataUrls) {
    const parsed = parseImageDataUrl(url);
    const image =
      parsed.mediaType === 'image/png'
        ? await doc.embedPng(parsed.bytes)
        : await doc.embedJpg(parsed.bytes);

    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    const scale = Math.min(A4_WIDTH / image.width, A4_HEIGHT / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: (A4_WIDTH - w) / 2,
      y: (A4_HEIGHT - h) / 2,
      width: w,
      height: h,
    });
  }

  return await doc.save();
}

function parseImageDataUrl(url: string): { mediaType: 'image/jpeg' | 'image/png'; bytes: Uint8Array } {
  const match = url.match(/^data:(image\/(jpeg|png));base64,(.+)$/);
  if (!match) {
    throw new Error('Data URL inválido (apenas image/jpeg e image/png suportados).');
  }
  return {
    mediaType: match[1] as 'image/jpeg' | 'image/png',
    bytes: Buffer.from(match[3], 'base64'),
  };
}
