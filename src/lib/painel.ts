// src/lib/painel.ts
import { ApiError, type AnalyzeError } from './api';

// Tipos espelhados de api/_lib/painel-sadt.ts (cliente e servidor não compartilham módulos).
export type StatusPainel = 'falta_faturar' | 'faturada' | 'conferir' | 'pendencia' | 'duplicada' | 'registro_ilegivel';

export type GuiaPainel = {
  chave: string;
  paciente: string;
  data: string | null;
  status: StatusPainel;
  guiaPortal: string | null;
  valor: number | null;
  motivo: string | null;
  pdfId: string | null;
  digitalizadoPor: string | null;
};

export type PainelSadt = {
  mes: string;
  guias: GuiaPainel[];
  pdfsSemRegistro: { id: string; nome: string; link: string | null }[];
  ultimaExecucao: { inicio: string; fim: string; dryRun: boolean; resumo: string } | null;
  avisoLivro: string | null;
  totais: {
    digitalizadas: number;
    faturadas: number;
    valorFaturado: number;
    faltaFaturar: number;
    atencao: number;
    duplicadas: number;
  };
};

export async function buscarPainel(mes: string): Promise<PainelSadt> {
  const response = await fetch(`/api/sadt?mes=${encodeURIComponent(mes)}`, { credentials: 'include' });
  if (!response.ok) {
    let body: AnalyzeError = { error: 'http_error', message: `HTTP ${response.status}` };
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as PainelSadt;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function partes(mes: string): [number, number] {
  const [ano, mm] = mes.split('-').map(Number);
  return [ano ?? 0, mm ?? 1];
}

function formatar(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** O faturamento é feito no começo do mês seguinte: o painel abre no mês anterior. */
export function mesAnterior(hoje: Date): string {
  return deslocarMes(formatar(hoje.getFullYear(), hoje.getMonth() + 1), -1);
}

export function deslocarMes(mes: string, delta: number): string {
  const [ano, mm] = partes(mes);
  const indice = ano * 12 + (mm - 1) + delta;
  return formatar(Math.floor(indice / 12), (indice % 12) + 1);
}

export function rotuloMes(mes: string): string {
  const [ano, mm] = partes(mes);
  return `${MESES[mm - 1]} de ${ano}`;
}

export function diasDoMes(mes: string): number {
  const [ano, mm] = partes(mes);
  return new Date(Date.UTC(ano, mm, 0)).getUTCDate();
}

/** 0 = domingo. */
export function diaDaSemana(mes: string, dia: number): number {
  const [ano, mm] = partes(mes);
  return new Date(Date.UTC(ano, mm - 1, dia)).getUTCDay();
}

export function comandoRobo(mes: string, ensaio: boolean): string {
  return `npm run faturar-sadt -- ${mes}${ensaio ? ' --dry-run' : ''}`;
}

export function guiasPorDia(guias: GuiaPainel[]): Map<number, GuiaPainel[]> {
  const porDia = new Map<number, GuiaPainel[]>();
  for (const guia of guias) {
    if (!guia.data) continue;
    const dia = Number(guia.data.slice(8, 10));
    porDia.set(dia, [...(porDia.get(dia) ?? []), guia]);
  }
  return porDia;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Linha de detalhe de uma guia no painel. Nas guias que pedem atenção o número da
 * guia vai na frente do motivo, mas só quando o motivo ainda não o traz.
 */
export function detalheDaGuia(guia: GuiaPainel): string {
  if (guia.status === 'faturada') {
    return [guia.guiaPortal && `guia ${guia.guiaPortal}`, guia.valor !== null && formatarMoeda(guia.valor)]
      .filter(Boolean)
      .join(' · ');
  }
  if (guia.status === 'falta_faturar') {
    return guia.digitalizadoPor ? `digitalizada por ${guia.digitalizadoPor}` : 'digitalizada';
  }
  const motivo = guia.motivo ?? '';
  const numero = guia.guiaPortal;
  if (!numero) return motivo;
  if (!motivo) return `guia ${numero}`;
  return motivo.includes(numero) ? motivo : `guia ${numero} · ${motivo}`;
}
