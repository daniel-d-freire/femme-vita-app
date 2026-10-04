// api/_lib/painel-anexos.ts
import { z } from 'zod';

/**
 * Painel do registro que o robô anexar-contas grava em Apolo/_ANEXOS/<AAAA.MM>/_anexos.json
 * (spec do robô, §6). "enviando" aparece como "conferir": o robô clicou em Processar e não viu
 * a confirmação, então só uma pessoa, olhando o portal, decide se reenvia.
 */
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

const EntradaSchema = z.object({
  status: z.enum(['nao_enviada', 'pendencia', 'enviando', 'anexada']),
  nr: z.string(),
  tipo: z.enum(['honorarios', 'sadt', 'desconhecido']),
  paciente: z.string(),
  arquivos: z.array(z.string()),
  motivo: z.string().nullable(),
  em: z.string(),
  nota: z.string().optional(),
});

const RegistroSchema = z.object({
  versao: z.literal(1),
  referencia: z.string(),
  execucoes: z.array(z.object({ inicio: z.string(), fim: z.string(), dryRun: z.boolean(), resumo: z.string() })),
  contas: z.record(z.string(), EntradaSchema),
});

/** "2026-11" → "11/2026". */
export function referenciaDoMes(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

/** "2026-11" → "2026.11", o nome da pasta em _ANEXOS. */
export function pastaDoMesAnexos(mes: string): string {
  return mes.replace('-', '.');
}

const ORDEM: Record<StatusConta, number> = { conferir: 0, pendencia: 1, nao_enviada: 2, anexada: 3 };

/** `registros`: um item por _anexos.json achado na pasta do mês (null = não abriu). */
export function montarPainelAnexos(entrada: { mes: string; registros: unknown[] }): PainelAnexos {
  const { mes } = entrada;
  const referencia = referenciaDoMes(mes);
  const vazio = (aviso: string | null): PainelAnexos => ({
    mes,
    referencia,
    contas: [],
    ultimaExecucao: null,
    aviso,
    totais: { total: 0, anexadas: 0, pendencias: 0, conferir: 0, naoEnviadas: 0 },
  });

  if (entrada.registros.length === 0) return vazio(null);
  if (entrada.registros.length > 1) {
    return vazio('Há mais de um _anexos.json para este mês no Drive (pasta duplicada). Junte-os antes de rodar o robô (avise o Daniel).');
  }
  const validado = RegistroSchema.safeParse(entrada.registros[0]);
  if (!validado.success) {
    return vazio('O registro deste mês não abriu ou está fora do formato. Não rode o robô antes de conferir o arquivo _anexos.json (avise o Daniel).');
  }
  if (validado.data.referencia !== referencia) {
    return vazio(`O registro desta pasta é da Referência ${validado.data.referencia}, não de ${referencia}.`);
  }

  const contas: ContaPainel[] = Object.entries(validado.data.contas)
    .map(([conta, e]) => ({
      conta,
      nr: e.nr,
      tipo: e.tipo,
      paciente: e.paciente,
      status: (e.status === 'enviando' ? 'conferir' : e.status) as StatusConta,
      arquivos: e.arquivos,
      motivo: e.motivo,
      em: e.em,
      nota: e.nota ?? null,
    }))
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.paciente.localeCompare(b.paciente, 'pt-BR') || a.conta.localeCompare(b.conta));

  const quantos = (s: StatusConta) => contas.filter((c) => c.status === s).length;
  return {
    mes,
    referencia,
    contas,
    ultimaExecucao: validado.data.execucoes[validado.data.execucoes.length - 1] ?? null,
    aviso: null,
    totais: {
      total: contas.length,
      anexadas: quantos('anexada'),
      pendencias: quantos('pendencia'),
      conferir: quantos('conferir'),
      naoEnviadas: quantos('nao_enviada'),
    },
  };
}
