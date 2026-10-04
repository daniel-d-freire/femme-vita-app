// src/lib/anexos.ts
import { ApiError, type AnalyzeError } from './api';

// Tipos espelhados de api/_lib/painel-anexos.ts (cliente e servidor não compartilham módulos).
export type StatusConta = 'conferir' | 'pendencia' | 'nao_enviada' | 'anexada';
export type TipoConta = 'honorarios' | 'sadt' | 'desconhecido';

export type ContaPainel = {
  conta: string;
  nr: string;
  tipo: TipoConta;
  paciente: string;
  status: StatusConta;
  arquivos: string[];
  motivo: string | null;
  em: string;
  nota: string | null;
};

export type PainelAnexos = {
  mes: string;
  referencia: string;
  contas: ContaPainel[];
  ultimaExecucao: { inicio: string; fim: string; dryRun: boolean; resumo: string } | null;
  aviso: string | null;
  totais: { total: number; anexadas: number; pendencias: number; conferir: number; naoEnviadas: number };
};

export async function buscarPainelAnexos(mes: string): Promise<PainelAnexos> {
  const response = await fetch(`/api/anexos?mes=${encodeURIComponent(mes)}`, { credentials: 'include' });
  if (!response.ok) {
    let body: AnalyzeError = { error: 'http_error', message: `HTTP ${response.status}` };
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as PainelAnexos;
}

/** A Referência é o mês em que o lote foi enviado; o painel abre no mês corrente. */
export function mesAtual(hoje: Date): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function referencia(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export function comandoAnexos(mes: string, ensaio: boolean): string {
  return `npm run anexar-contas -- ${referencia(mes)}${ensaio ? ' --dry-run' : ''}`;
}

/** Só depois de conferir no portal que o anexo NÃO está lá. */
export function comandoReenvio(mes: string, conta: string): string {
  return `npm run anexar-contas -- ${referencia(mes)} --conta ${conta} --reenviar ${conta}`;
}

export function rotuloTipo(tipo: TipoConta): string {
  return tipo === 'sadt' ? 'SADT' : tipo === 'honorarios' ? 'Honorários' : 'Tipo não previsto';
}

export function detalheDaConta(c: ContaPainel): string {
  const base = `Conta ${c.conta} · ${rotuloTipo(c.tipo)}`;
  if (c.status === 'pendencia') return `${base} · ${c.motivo ?? 'sem motivo registrado'}`;
  if (c.status === 'nao_enviada') return `${base} · ainda não passou pelo robô`;
  return c.arquivos.length > 0 ? `${base} · ${c.arquivos.join(' · ')}` : base;
}
