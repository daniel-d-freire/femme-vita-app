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
    .replace(/[\u0300-\u036f]/g, '')
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

/** O que o cruzamento precisa de cada registro de guia do mês. */
export type RegistroCruzamento = {
  chave: string;
  paciente: string;
  nomeNaGuia: string | null;
  carteira: string | null;
  data: string;
  faturada: boolean;
};

export type BlocoAgenda = {
  disponivel: true;
  atendidas: number;
  digitalizadas: number;
  faturadas: number;
  semGuia: { paciente: string; data: string; servico: string | null }[];
  semBaixa: SemBaixa[];
  guiaSemAtendimento: { chave: string; paciente: string; data: string | null }[];
  convenioErrado: { paciente: string; data: string; convenio: string | null }[];
  dataDiferente: { chave: string; dataAgenda: string }[];
};

/** Guia com data até aqui de distância do atendimento ainda casa (a leitura da data pode errar). */
const MAX_DIAS = 3;
const CARTEIRA_MINIMA = 7;

const distanciaEmDias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

function mesmaPessoa(a: Atendimento, r: RegistroCruzamento): boolean {
  if (mesmaPaciente(a.paciente, r.paciente)) return true;
  if (r.nomeNaGuia && mesmaPaciente(a.paciente, r.nomeNaGuia)) return true;
  const c1 = a.carteira ?? '';
  const c2 = (r.carteira ?? '').replace(/\D/g, '');
  return c1.length >= CARTEIRA_MINIMA && c1 === c2;
}

/**
 * Casa cada atendimento com no máximo um registro: primeiro no mesmo dia, depois o
 * mais próximo até MAX_DIAS. MedSênior tem preferência; atendimento de outro convênio
 * só conta quando casa com uma guia (o Apolo estava com o convênio errado).
 */
export function cruzarAgenda(atendidos: Atendimento[], semBaixa: SemBaixa[], registros: RegistroCruzamento[]): BlocoAgenda {
  const ordem = [...atendidos].sort((a, b) => Number(b.medsenior) - Number(a.medsenior) || a.data.localeCompare(b.data));
  const livres = new Set(registros.map((r) => r.chave));
  const par = new Map<Atendimento, RegistroCruzamento>();

  for (const a of ordem) {
    const r = registros.find((r) => livres.has(r.chave) && r.data === a.data && mesmaPessoa(a, r));
    if (r) {
      par.set(a, r);
      livres.delete(r.chave);
    }
  }
  const dataDiferente: BlocoAgenda['dataDiferente'] = [];
  for (const a of ordem) {
    if (par.has(a)) continue;
    const perto = registros
      .filter((r) => livres.has(r.chave) && distanciaEmDias(r.data, a.data) <= MAX_DIAS && mesmaPessoa(a, r))
      .sort((x, y) => distanciaEmDias(x.data, a.data) - distanciaEmDias(y.data, a.data))[0];
    if (perto) {
      par.set(a, perto);
      livres.delete(perto.chave);
      dataDiferente.push({ chave: perto.chave, dataAgenda: a.data });
    }
  }

  const contados = atendidos.filter((a) => a.medsenior || par.has(a));
  const casados = contados.filter((a) => par.has(a));
  return {
    disponivel: true,
    atendidas: contados.length,
    digitalizadas: casados.length,
    faturadas: casados.filter((a) => par.get(a)?.faturada).length,
    semGuia: atendidos
      .filter((a) => a.medsenior && !par.has(a))
      .map((a) => ({ paciente: a.paciente, data: a.data, servico: a.servico })),
    semBaixa,
    guiaSemAtendimento: registros
      .filter((r) => livres.has(r.chave))
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((r) => ({ chave: r.chave, paciente: r.paciente, data: r.data })),
    convenioErrado: atendidos
      .filter((a) => !a.medsenior && par.has(a))
      .map((a) => ({ paciente: a.paciente, data: a.data, convenio: a.convenio })),
    dataDiferente,
  };
}
