// api/_lib/painel-sadt.ts
import { z } from 'zod';
import { cruzarAgenda, separarAgenda, type BlocoAgenda } from './agenda-sadt.js';
import type { ResultadoAgenda } from './ninsaude.js';

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

export type PdfSemRegistro = { id: string; nome: string; link: string | null };
export type ExecucaoPainel = { inicio: string; fim: string; dryRun: boolean; resumo: string };

export type AgendaPainel = { disponivel: false; motivo: string } | BlocoAgenda;

export type PainelSadt = {
  mes: string;
  guias: GuiaPainel[];
  pdfsSemRegistro: PdfSemRegistro[];
  ultimaExecucao: ExecucaoPainel | null;
  avisoLivro: string | null;
  agenda: AgendaPainel;
  totais: {
    digitalizadas: number;
    faturadas: number;
    valorFaturado: number;
    faltaFaturar: number;
    atencao: number;
    duplicadas: number;
  };
};

/** Só o que o painel usa do registro: leitura tolerante a campos novos. */
const RegistroLeitura = z.object({
  paciente: z.string().min(1),
  nomeNaGuia: z.string().optional(),
  carteira: z.string().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pdf: z.object({ id: z.string().min(1) }),
  digitalizadoPor: z.string().optional(),
});

const STATUS_DO_LIVRO = {
  faturada: 'faturada',
  finalizando: 'conferir',
  salva_sem_finalizar: 'conferir',
  pendencia: 'pendencia',
  duplicada: 'duplicada',
} as const satisfies Record<string, StatusPainel>;

const EntradaLeitura = z.object({
  status: z.enum(['faturada', 'finalizando', 'salva_sem_finalizar', 'pendencia', 'duplicada']),
  paciente: z.string(),
  data: z.string(),
  guiaPortal: z.string().nullable(),
  valor: z.number().nullable(),
  motivo: z.string().nullable(),
});

const LivroLeitura = z.object({
  execucoes: z.array(z.object({ inicio: z.string(), fim: z.string(), dryRun: z.boolean(), resumo: z.string() })),
  guias: z.record(z.string(), EntradaLeitura),
});

/** Guia_SADT_<Paciente>_<AAAA.MM.DD>[_N].pdf do mês pedido. */
export function pdfDoMes(nome: string, mes: string): boolean {
  const [ano, mm] = mes.split('-');
  return new RegExp(`^Guia_SADT_.+_${ano}\\.${mm}\\.\\d{2}(_\\d+)?\\.pdf$`, 'i').test(nome);
}

export function montarPainel(entrada: {
  mes: string;
  registros: { nome: string; conteudo: unknown }[];
  livro: unknown | null;
  pdfs: PdfSemRegistro[];
  /** Agenda do mês no NinSaúde; ausente = conferência desligada. */
  agenda?: ResultadoAgenda;
  /** AAAA-MM-DD em Brasília: consulta antes de hoje sem baixa vira aviso. */
  hoje?: string;
}): PainelSadt {
  let livro: z.infer<typeof LivroLeitura> | null = null;
  let avisoLivro: string | null = null;
  if (entrada.livro !== null) {
    const lido = LivroLeitura.safeParse(entrada.livro);
    if (lido.success) livro = lido.data;
    else avisoLivro = 'O livro do faturamento (_faturamento.json) está fora do formato. O status das guias pode estar incompleto.';
  }

  const guias: GuiaPainel[] = [];
  const chaves = new Set<string>();
  const pdfsComRegistro = new Set<string>();
  const paraCruzar: { chave: string; paciente: string; nomeNaGuia: string | null; carteira: string | null; data: string; faturada: boolean }[] = [];

  for (const { nome, conteudo } of entrada.registros) {
    chaves.add(nome);
    const reg = RegistroLeitura.safeParse(conteudo);
    if (!reg.success) {
      guias.push({
        chave: nome,
        paciente: nome,
        data: null,
        status: 'registro_ilegivel',
        guiaPortal: null,
        valor: null,
        motivo: 'o registro .json não abriu ou está fora do formato',
        pdfId: null,
        digitalizadoPor: null,
      });
      continue;
    }
    pdfsComRegistro.add(reg.data.pdf.id);
    const anotado = livro?.guias[nome];
    guias.push({
      chave: nome,
      paciente: reg.data.paciente,
      data: reg.data.data,
      status: anotado ? STATUS_DO_LIVRO[anotado.status] : 'falta_faturar',
      guiaPortal: anotado?.guiaPortal ?? null,
      valor: anotado?.valor ?? null,
      motivo: anotado?.motivo ?? null,
      pdfId: reg.data.pdf.id,
      digitalizadoPor: reg.data.digitalizadoPor ?? null,
    });
    paraCruzar.push({
      chave: nome,
      paciente: reg.data.paciente,
      nomeNaGuia: reg.data.nomeNaGuia ?? null,
      carteira: reg.data.carteira ?? null,
      data: reg.data.data,
      faturada: anotado?.status === 'faturada',
    });
  }

  // Entrada do livro cujo registro sumiu continua sendo um fato do faturamento.
  for (const [chave, anotado] of Object.entries(livro?.guias ?? {})) {
    if (chaves.has(chave)) continue;
    guias.push({
      chave,
      paciente: anotado.paciente,
      data: anotado.data || null,
      status: STATUS_DO_LIVRO[anotado.status],
      guiaPortal: anotado.guiaPortal,
      valor: anotado.valor,
      motivo: anotado.motivo,
      pdfId: null,
      digitalizadoPor: null,
    });
  }

  guias.sort(
    (a, b) => (a.data ?? '9999-99-99').localeCompare(b.data ?? '9999-99-99') || a.paciente.localeCompare(b.paciente, 'pt-BR'),
  );

  const pdfsSemRegistro = entrada.pdfs.filter((p) => pdfDoMes(p.nome, entrada.mes) && !pdfsComRegistro.has(p.id));
  const execucoes = livro?.execucoes ?? [];
  const contar = (status: StatusPainel) => guias.filter((g) => g.status === status).length;
  const valorFaturado = guias
    .filter((g) => g.status === 'faturada')
    .reduce((soma, g) => soma + (g.valor ?? 0), 0);

  let agenda: AgendaPainel = { disponivel: false, motivo: 'conferência com a agenda desligada' };
  if (entrada.agenda && !entrada.agenda.ok) agenda = { disponivel: false, motivo: entrada.agenda.motivo };
  if (entrada.agenda?.ok) {
    const { atendidos, semBaixa } = separarAgenda(entrada.agenda.itens, entrada.mes, entrada.hoje ?? hojeEmBrasilia());
    agenda = cruzarAgenda(atendidos, semBaixa, paraCruzar);
  }

  return {
    mes: entrada.mes,
    guias,
    pdfsSemRegistro,
    ultimaExecucao: execucoes.at(-1) ?? null,
    avisoLivro,
    agenda,
    totais: {
      digitalizadas: entrada.registros.length,
      faturadas: contar('faturada'),
      valorFaturado: Math.round(valorFaturado * 100) / 100,
      faltaFaturar: contar('falta_faturar'),
      atencao: contar('conferir') + contar('pendencia') + contar('registro_ilegivel') + pdfsSemRegistro.length,
      duplicadas: contar('duplicada'),
    },
  };
}

/** Como Promise.all, mas com no máximo `limite` chamadas ao mesmo tempo (a API do Drive limita a taxa). */
export async function mapearComLimite<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultado = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async (): Promise<void> => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultado[i] = await fn(itens[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultado;
}

/** AAAA-MM-DD no fuso de Brasília (a função roda em UTC na Vercel). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
