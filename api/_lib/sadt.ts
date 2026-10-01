// api/_lib/sadt.ts
import { z } from 'zod';

/** Dados SADT que o cliente manda junto com as imagens no /api/upload. */
export const SadtUploadSchema = z.object({
  /** Nome usado no arquivo: o da pasta casada ou, sem pasta, o lido. */
  paciente: z.string().trim().min(1).max(120),
  /** Nome como está impresso na guia (campo 10), conferido pela recepção. É o que o robô compara com o portal. */
  nomeNaGuia: z.string().trim().min(1).max(120),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  senha: z.string().trim().max(30),
  carteira: z.string().trim().max(30),
  codigoProcedimento: z.string().trim().max(20),
});
export type SadtUpload = z.infer<typeof SadtUploadSchema>;

const NOME_PDF_SADT = /^Guia_SADT_.+_\d{4}\.\d{2}\.\d{2}\.pdf$/;

export function nomeSadtValido(nome: string): boolean {
  return NOME_PDF_SADT.test(nome);
}

/** O Drive aceita nomes repetidos; quem evita a colisão somos nós: _2, _3… antes do .pdf. */
export function nomeSemColisao(nome: string, existentes: string[]): string {
  const usados = new Set(existentes);
  if (!usados.has(nome)) return nome;
  const base = nome.replace(/\.pdf$/i, '');
  for (let n = 2; ; n++) {
    const candidato = `${base}_${n}.pdf`;
    if (!usados.has(candidato)) return candidato;
  }
}

/** "2026-09-30" → "2026.09", o nome da pasta do mês em Apolo/_SADT. */
export function pastaDoMes(dataIso: string): string {
  return dataIso.slice(0, 7).replace('-', '.');
}

/** O registro tem o mesmo nome do PDF, com .json. */
export function nomeDoRegistro(nomePdf: string): string {
  return nomePdf.replace(/\.pdf$/i, '.json');
}

/** Formato lido pelo robô faturar-sadt (spec, seção 9). Escrito uma vez, nunca editado pelo app. */
export type RegistroSadt = {
  versao: 1;
  paciente: string;
  nomeNaGuia: string;
  data: string;
  senha: string;
  carteira: string;
  codigoProcedimento: string;
  pdf: { id: string; nome: string; pendente: boolean };
  digitalizadoEm: string;
  digitalizadoPor: string;
};

export function montarRegistro(entrada: {
  sadt: SadtUpload;
  pdf: { id: string; nome: string };
  pendente: boolean;
  email: string;
  agora: Date;
}): RegistroSadt {
  return {
    versao: 1,
    paciente: entrada.sadt.paciente,
    nomeNaGuia: entrada.sadt.nomeNaGuia,
    data: entrada.sadt.data,
    senha: entrada.sadt.senha,
    carteira: entrada.sadt.carteira,
    codigoProcedimento: entrada.sadt.codigoProcedimento,
    pdf: { id: entrada.pdf.id, nome: entrada.pdf.nome, pendente: entrada.pendente },
    digitalizadoEm: entrada.agora.toISOString(),
    digitalizadoPor: entrada.email,
  };
}

/** Roda `fn` até `tentativas` vezes, com pausa entre elas. Devolve true se alguma deu certo. */
export async function tentarAte(tentativas: number, pausaMs: number, fn: () => Promise<void>): Promise<boolean> {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await fn();
      return true;
    } catch (err) {
      console.error(`[sadt] tentativa ${i}/${tentativas} falhou:`, err instanceof Error ? err.message : err);
      if (i < tentativas) await new Promise((resolve) => setTimeout(resolve, pausaMs));
    }
  }
  return false;
}
