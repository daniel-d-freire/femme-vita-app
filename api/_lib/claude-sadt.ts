// api/_lib/claude-sadt.ts
import { z } from 'zod';
import { pedirJsonAoClaude, type ImageInput } from './claude.js';

export const SadtResultSchema = z.object({
  e_guia_sadt: z.boolean(),
  patient_name: z.string(),
  data_autorizacao: z.string(),
  senha: z.string(),
  carteira: z.string(),
  codigo_procedimento: z.string(),
  e_consulta: z.boolean(),
  confidence_name: z.number().min(0).max(1),
  confidence_data: z.number().min(0).max(1),
  confidence_senha: z.number().min(0).max(1),
  error: z.enum(['not_recognized', 'multiple_documents']).nullable(),
  rotation_to_apply: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export type SadtResult = z.infer<typeof SadtResultSchema>;

export const SADT_PROMPT = `Você lê a "GUIA DE SERVIÇO PROFISSIONAL / SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA (SP/SADT)" da operadora MedSênior, no padrão TISS. É um formulário em paisagem, impresso pelo portal da operadora, com campos numerados. Os dados que interessam vêm IMPRESSOS (digitados), não manuscritos. A guia costuma ter assinatura da paciente e carimbo da médica por cima de alguns campos.

Você recebe uma ou mais imagens do MESMO documento. Extraia:

1. "e_guia_sadt": true se o título do formulário contiver "SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA" e "SP/SADT" (impresso como "GUIA DE SERVIÇO PROFISSIONAL / SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA (SP/SADT)"). Guia de internação, guia de honorários, guia de consulta, descrição cirúrgica ou qualquer outro documento: false.
2. "patient_name": o campo "10-Nome", no bloco "Dados do Beneficiário", exatamente como impresso. NÃO use "14-Nome do Contratado", "15-Nome do Profissional Solicitante" nem "30-Nome do Contratado": esses são a médica ou a empresa dela.
3. "data_autorizacao": o campo "4-Data da Autorização", no formato DD/MM/AAAA. NÃO use "6-Data de Validade da Senha", "22-Data da Solicitação" nem a data de impressão do rodapé. Os campos 4, 5 e 6 ficam na mesma linha: a 4-Data da Autorização fica à esquerda da 5-Senha, e a 6-Data de Validade fica à direita e é posterior.
4. "senha": o campo "5-Senha", exatamente como impressa, sem espaços.
5. "carteira": o campo "8-Número da Carteira", só os dígitos.
6. "codigo_procedimento": o campo "25-Código do Procedimento ou Item Assistencial", primeira linha, só os dígitos.
7. "e_consulta": true se o procedimento da primeira linha (campos 25 e 26) for uma CONSULTA: descrição começando com "CONSULTA" (ex.: "CONSULTA ELETIVA - GINECOLOGIA") ou código 98250159. Exame, ultrassom, biópsia ou outro procedimento: false. Decida principalmente pela descrição, que é maior e mais legível que o código.
8. Confiança de 0.0 a 1.0 para nome (confidence_name), data (confidence_data) e senha (confidence_senha). BAIXE a confiança se o texto estiver borrado, cortado, coberto por carimbo ou assinatura, ou se algum dígito for ambíguo (0/O, 1/I/7, 5/S, 8/B).
9. "rotation_to_apply": a orientação REAL dos pixels da imagem.

   AVISO: você lê texto rotacionado sem esforço. Para esta tarefa, RESISTA a esse impulso e reporte a orientação dos pixels, não a orientação corrigida mentalmente.

   PASSO 1 — Ache o título "GUIA DE SERVIÇO PROFISSIONAL / SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA (SP/SADT)" e o logo MedSênior ao lado dele.
   PASSO 2 — Em qual BORDA DA IMAGEM (não do documento) esse título está fisicamente mais próximo?
   PASSO 3 — Mapeie (graus no sentido horário para deixar em pé):
     título na BORDA SUPERIOR → 0
     título na BORDA ESQUERDA → 90
     título na BORDA INFERIOR → 180
     título na BORDA DIREITA  → 270

REGRAS:
- Se não for guia SP/SADT, defina e_guia_sadt=false e error="not_recognized", e ainda devolva o que conseguir ler, com confiança baixa.
- Se houver claramente mais de um documento na imagem, defina error="multiple_documents".
- Campo não encontrado: string vazia e confiança 0.

Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois:

{
  "e_guia_sadt": true,
  "patient_name": "string",
  "data_autorizacao": "DD/MM/AAAA",
  "senha": "string",
  "carteira": "string",
  "codigo_procedimento": "string",
  "e_consulta": true,
  "confidence_name": 0.0,
  "confidence_data": 0.0,
  "confidence_senha": 0.0,
  "error": null,
  "rotation_to_apply": 0
}`;

/** Valida a resposta e garante que "não é SADT" sempre vem com erro. */
export function validarRespostaSadt(json: unknown): SadtResult {
  const validated = SadtResultSchema.safeParse(json);
  if (!validated.success) {
    throw new Error(
      `Schema inválido na resposta do Claude: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  if (!validated.data.e_guia_sadt && validated.data.error === null) {
    return { ...validated.data, error: 'not_recognized' };
  }
  return validated.data;
}

export async function analisarGuiaSadt(images: ImageInput[]): Promise<SadtResult> {
  return validarRespostaSadt(await pedirJsonAoClaude(SADT_PROMPT, images));
}
