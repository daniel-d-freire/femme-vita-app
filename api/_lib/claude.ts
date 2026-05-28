import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

export const AnalyzeResultSchema = z.object({
  patient_name: z.string(),
  document_type: z.enum(['guia_internacao', 'descricao_cirurgica', 'guia_honorarios_assinada']).nullable(),
  confidence_name: z.number().min(0).max(1),
  confidence_type: z.number().min(0).max(1),
  error: z.enum(['not_recognized', 'multiple_documents']).nullable(),
  rotation_to_apply: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

const SYSTEM_PROMPT = `Você é um assistente que lê documentos médicos brasileiros: guias de internação hospitalar, descrições cirúrgicas e guias de honorários assinadas.

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
   - "guia_honorarios_assinada" → guia de honorários médicos PREENCHIDA E ASSINADA. Critérios OBRIGATÓRIOS, ambos têm que estar presentes:
       (a) Título "GUIA DE HONORÁRIOS" (geralmente com subtítulo "Somente para pacientes internados") no cabeçalho.
       (b) Assinatura e/ou carimbo VISÍVEL no campo "Assinatura do Profissional Executante" (carimbo da médica executora — tipicamente Priscila Guyt Rebelo, CRM 52972460, Ginecologia e Obstetrícia — ou rabisco de assinatura claramente sobreposto à linha).
     Se o título "GUIA DE HONORÁRIOS" estiver presente mas NÃO houver assinatura/carimbo visível, NÃO classifique como "guia_honorarios_assinada" — defina document_type=null e error="not_recognized".
3. Confiança de cada campo, de 0.0 a 1.0.
4. ORIENTAÇÃO DA IMAGEM (rotation_to_apply) — LEIA COM ATENÇÃO:

   AVISO CRÍTICO: você é uma vision model treinada para ler textos automaticamente, mesmo quando estão rotacionados. Para esta tarefa específica, RESISTA esse impulso. Você DEVE reportar a orientação REAL DOS PIXELS da imagem que recebeu, não a orientação corrigida mentalmente.

   PROCESSO OBRIGATÓRIO (siga literalmente, em voz interna):

   PASSO 1 — Identifique o cabeçalho/título principal do documento:
     • Guia de internação: o título grande "GUIA DE INTERNAÇÃO..." / "AUTORIZAÇÃO DE INTERNAÇÃO" no topo do formulário
     • Descrição cirúrgica: o cabeçalho institucional ou primeira linha do relato
     • Guia de honorários assinada: o título grande "GUIA DE HONORÁRIOS" no topo do formulário

   PASSO 2 — Encontre esse cabeçalho NOS PIXELS da imagem que você recebeu. Em qual das 4 BORDAS DA IMAGEM (não do documento — da imagem!) ele está fisicamente mais próximo?
     - borda superior (topo da imagem)
     - borda inferior (parte de baixo da imagem)
     - borda esquerda da imagem
     - borda direita da imagem

   PASSO 3 — Mapeie para rotation_to_apply (graus no sentido horário pra deixar em pé):
     cabeçalho na BORDA SUPERIOR  → rotation_to_apply = 0    (já está em pé)
     cabeçalho na BORDA ESQUERDA  → rotation_to_apply = 90   (documento deitado pra esquerda)
     cabeçalho na BORDA INFERIOR  → rotation_to_apply = 180  (documento de cabeça pra baixo)
     cabeçalho na BORDA DIREITA   → rotation_to_apply = 270  (documento deitado pra direita)

   EXEMPLO DO ERRO QUE VOCÊ DEVE EVITAR:
   Se a imagem mostra "GUIA DE HONORÁRIOS" claramente DE CABEÇA PRA BAIXO (você consegue interpretar o texto invertido, mas as letras estão fisicamente giradas 180°), reporte 180. NÃO reporte 0 só porque conseguiu entender o conteúdo.

REGRAS IMPORTANTES:
- Se houver incerteza sobre o tipo do documento, BAIXE confidence_type.
- Se o nome estiver borrado, manchado, parcial ou ilegível, BAIXE confidence_name.
- O nome a extrair é APENAS da PACIENTE / BENEFICIÁRIA. Ignore nomes de médicos, anestesistas, auxiliares, instrumentadoras, beneficiárias jurídicas, atendentes, prestadores ou contratados executantes.
- Na Guia de Honorários, o nome da paciente está no campo "Nome" dentro do bloco "Dados do Beneficiário" — NÃO confunda com "Nome do Contratado" (que é a profissional/empresa executante).
- Procure os campos "Nome do Beneficiário", "Paciente", "Nome do Paciente", ou similar, conforme o documento.
- Se a imagem não for nenhum dos três tipos reconhecidos, defina error="not_recognized".
- Se houver claramente mais de um documento diferente fotografado na mesma imagem, defina error="multiple_documents".
- Quando definir error, ainda devolva patient_name e document_type com os melhores valores possíveis, mas com confidence baixa.

Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois, sem comentários. Schema:

{
  "patient_name": "string (vazio se não encontrado)",
  "document_type": "guia_internacao" | "descricao_cirurgica" | "guia_honorarios_assinada" | null,
  "confidence_name": 0.0,
  "confidence_type": 0.0,
  "error": null | "not_recognized" | "multiple_documents",
  "rotation_to_apply": 0 | 90 | 180 | 270
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
