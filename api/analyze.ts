import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { analyzeDocument, parseDataUrl } from './_lib/claude.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 60,
};

const RequestBodySchema = z.object({
  images: z.array(z.string().startsWith('data:image/')).min(1).max(10),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const parsed = RequestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_body',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const images = parsed.data.images.map(parseDataUrl);
    const startedAt = Date.now();
    const result = await analyzeDocument(images);
    const elapsedMs = Date.now() - startedAt;

    return res.status(200).json({
      ...result,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    console.error('[analyze] error:', message);
    return res.status(500).json({ error: 'analyze_failed', message });
  }
}
