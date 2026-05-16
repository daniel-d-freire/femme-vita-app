import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

export const AnalyzeResultSchema = z.object({
  patient_name: z.string(),
  document_type: z.enum(['guia_internacao', 'descricao_cirurgica']).nullable(),
  confidence_name: z.number().min(0).max(1),
  confidence_type: z.number().min(0).max(1),
  error: z.enum(['not_recognized', 'multiple_documents']).nullable(),
});

export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

const SYSTEM_PROMPT = `Você é um assistente que lê documentos médicos brasileiros: guias de internação hospitalar e descrições cirúrgicas.

Você recebe uma ou mais imagens de páginas do MESMO documento. Analise e extraia:

1. Nome COMPLETO da paciente (como aparece no documento, preservando maiúsculas/minúsculas exatamente como estão escritas).
2. Tipo do documento, sendo APENAS um destes valores:
   - "guia_internacao" → cabeçalho ou título contém qualquer combinação de GUIA + INTERNAÇÃO ou termos correlatos. Exemplos:
       • "GUIA DE INTERNAÇÃO HOSPITALAR"
       • "GUIA DE SOLICITAÇÃO DE INTERNAÇÃO"
       • "GUIA DE SOLICITAÇÃO DE INTERNAÇÃO HOSPITALAR"
       • "AUTORIZAÇÃO DE INTERNAÇÃO HOSPITALAR" (AIH)
       • "SP/SADT" quando associado a internação
   - "descricao_cirurgica" → texto descrevendo um ato cirúrgico:
       equipe cirúrgica (cirurgião, auxiliares, anestesista, instrumentadora),
       técnica/tempo cirúrgico, anestesia, achados intraoperatórios,
       síntese/sutura, sangramento, complicações, etc.
3. Confiança de cada campo, de 0.0 a 1.0.

REGRAS IMPORTANTES:
- Se houver incerteza sobre o tipo do documento, BAIXE confidence_type.
- Se o nome estiver borrado, manchado, parcial ou ilegível, BAIXE confidence_name.
- O nome a extrair é APENAS da PACIENTE. Ignore nomes de médicos, anestesistas, auxiliares, instrumentadoras, beneficiárias jurídicas, atendentes.
- Procure o campo "Nome do Beneficiário", "Paciente", "Nome do Paciente", ou similar.
- Se a imagem não for nem guia de internação nem descrição cirúrgica, defina error="not_recognized".
- Se houver claramente mais de um documento diferente fotografado na mesma imagem, defina error="multiple_documents".
- Quando definir error, ainda devolva patient_name e document_type com os melhores valores possíveis, mas com confidence baixa.

Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois, sem comentários. Schema:

{
  "patient_name": "string (vazio se não encontrado)",
  "document_type": "guia_internacao" | "descricao_cirurgica" | null,
  "confidence_name": 0.0,
  "confidence_type": 0.0,
  "error": null | "not_recognized" | "multiple_documents"
}`;

export type ImageInput = {
  /** base64 data without the `data:image/...;base64,` prefix */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
};

export async function analyzeDocument(images: ImageInput[]): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não está configurada no servidor.');
  }
  if (images.length === 0) {
    throw new Error('Nenhuma imagem foi enviada.');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType,
              data: img.data,
            },
          })),
          {
            type: 'text' as const,
            text: 'Extraia os dados conforme as instruções. Retorne SOMENTE o JSON.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Resposta do Claude sem conteúdo de texto.');
  }

  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Resposta do Claude não contém JSON: ${raw.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`JSON inválido na resposta do Claude: ${(err as Error).message}`, { cause: err });
  }

  const validated = AnalyzeResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Schema inválido na resposta do Claude: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }

  return validated.data;
}

export function parseDataUrl(dataUrl: string): ImageInput {
  const match = dataUrl.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) {
    throw new Error('Data URL inválido (esperado image/jpeg|png|webp|gif em base64).');
  }
  return {
    mediaType: match[1] as ImageInput['mediaType'],
    data: match[3],
  };
}
