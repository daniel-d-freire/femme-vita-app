// src/lib/sadt.ts
// Regras puras do modo SADT: guias SP/SADT de consulta da MedSênior.
// Spec: Claude_Femme_Vita/docs/superpowers/specs/2026-10-01-guias-sadt-medsenior-design.md

/** Único procedimento SADT que o robô fatura: consulta em consultório. */
export const CODIGO_CONSULTA = '98250159';

/** Mesmo corte do selo "Alta" do app. Abaixo disso a tela pede conferência. */
export const CONFIANCA_ALTA = 0.95;

/** "30/09/2026" → "2026-09-30". Devolve null para texto que não é uma data real. */
export function dataBrParaIso(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (ano < 2000 || ano > 2099) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "2026-09-30" → "30/09/2026". */
export function isoParaDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Guia_SADT_<Paciente>_<AAAA.MM.DD>.pdf, com a mesma limpeza do buildFileName. */
export function nomeArquivoSadt(paciente: string, dataIso: string): string {
  const limpo = paciente.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `Guia_SADT_${limpo}_${dataIso.replace(/-/g, '.')}.pdf`;
}

/** Senha MedSênior é só dígitos. A observada tinha 11; aceitamos 6 a 20 para não travar variação. */
export function senhaPareceValida(senha: string): boolean {
  return /^\d{6,20}$/.test(senha.trim());
}

export type AvisoSadt = 'codigo_fora_do_escopo' | 'senha_duvidosa' | 'data_duvidosa';

export function avisosSadt(entrada: {
  codigo: string;
  senha: string;
  confiancaSenha: number;
  confiancaData: number;
}): AvisoSadt[] {
  const avisos: AvisoSadt[] = [];
  if (entrada.codigo.trim() !== CODIGO_CONSULTA) avisos.push('codigo_fora_do_escopo');
  if (!senhaPareceValida(entrada.senha) || !(entrada.confiancaSenha >= CONFIANCA_ALTA)) avisos.push('senha_duvidosa');
  if (!(entrada.confiancaData >= CONFIANCA_ALTA)) avisos.push('data_duvidosa');
  return avisos;
}
