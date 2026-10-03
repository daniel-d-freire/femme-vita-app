// api/_lib/agenda-sadt.ts
import { z } from 'zod';

/** Status do NinSaúde: 0 agendado, 2 confirmado, 3 atendido, 4 falta, 5 cancelado, 7 reagendado. */
const ATENDIDO = 3;
const SEM_BAIXA: Record<number, 'agendada' | 'confirmada'> = { 0: 'agendada', 2: 'confirmada' };
/** Id do convênio MedSênior no NinSaúde (conferido em setembro/2026). */
const MEDSENIOR_ID = 4;

const ItemLeitura = z.object({
  id: z.union([z.number(), z.string()]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pacienteNome: z.string().min(1),
  status: z.number(),
  servicoDescricao: z.string().nullish(),
  convenioId: z.number().nullish(),
  convenioTitulo: z.string().nullish(),
  convenioCarteira: z.union([z.string(), z.number()]).nullish(),
});

export type Atendimento = {
  id: string;
  data: string;
  paciente: string;
  servico: string | null;
  convenio: string | null;
  medsenior: boolean;
  carteira: string | null;
};

export type SemBaixa = { paciente: string; data: string; servico: string | null; status: 'agendada' | 'confirmada' };

export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/-/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mesma regra do robô (femme-vita-faturamento/src/dominio/nomes.ts): iguais, ou o mais
 * curto é prefixo do mais longo, com pelo menos 3 palavras e no máximo 1 a menos.
 */
export function mesmaPaciente(x: string, y: string): boolean {
  const a = normalizarNome(x).split(' ').filter(Boolean);
  const b = normalizarNome(y).split(' ').filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const menor = a.length <= b.length ? a : b;
  const maior = menor === a ? b : a;
  if (menor.length < 3) return false;
  if (maior.length - menor.length > 1) return false;
  return menor.every((palavra, i) => maior[i] === palavra);
}

export function ehMedsenior(convenioId: number | null | undefined, convenioTitulo: string | null | undefined): boolean {
  if (convenioId === MEDSENIOR_ID) return true;
  return normalizarNome(convenioTitulo ?? '').replace(/\s/g, '') === 'MEDSENIOR';
}

const soDigitos = (v: string | number | null | undefined): string | null => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d || null;
};

const porDataENome = <T extends { data: string; paciente: string }>(a: T, b: T) =>
  a.data.localeCompare(b.data) || a.paciente.localeCompare(b.paciente, 'pt-BR');

/**
 * Separa os itens do mês: atendidos (de qualquer convênio; a guia pode ser de uma
 * consulta que o Apolo tem sem convênio) e consultas MedSênior passadas sem baixa.
 */
export function separarAgenda(itens: unknown[], mes: string, hoje: string): { atendidos: Atendimento[]; semBaixa: SemBaixa[] } {
  const atendidos: Atendimento[] = [];
  const semBaixa: SemBaixa[] = [];
  for (const bruto of itens) {
    const lido = ItemLeitura.safeParse(bruto);
    if (!lido.success) continue;
    const i = lido.data;
    if (!i.data.startsWith(`${mes}-`)) continue;
    const medsenior = ehMedsenior(i.convenioId, i.convenioTitulo);
    const servico = i.servicoDescricao ?? null;
    if (i.status === ATENDIDO) {
      atendidos.push({
        id: String(i.id),
        data: i.data,
        paciente: i.pacienteNome,
        servico,
        convenio: i.convenioTitulo ?? null,
        medsenior,
        carteira: soDigitos(i.convenioCarteira),
      });
    } else if (medsenior && SEM_BAIXA[i.status] && i.data < hoje) {
      semBaixa.push({ paciente: i.pacienteNome, data: i.data, servico, status: SEM_BAIXA[i.status] });
    }
  }
  return { atendidos: atendidos.sort(porDataENome), semBaixa: semBaixa.sort(porDataENome) };
}
