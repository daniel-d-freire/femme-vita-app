# Painel SADT × agenda do Apolo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel `?tela=faturamento-sadt` do Arquivo cruza os atendimentos MedSênior da agenda do Apolo (NinSaúde) com as guias digitalizadas e mostra o que falta.

**Architecture:** O servidor (`api/sadt.ts`) lê a agenda do mês na API do NinSaúde em paralelo com o Drive. Funções puras em `api/_lib/agenda-sadt.ts` separam os atendimentos e cruzam com os registros; `montarPainel` devolve um bloco `agenda` novo no JSON. A tela ganha placar e seções novas, sem mudar as atuais.

**Tech Stack:** Vercel Functions (Node 24, TypeScript), Zod 4, Vitest, React 19 + Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-03-painel-sadt-agenda-apolo-design.md`

**Branch:** `painel-agenda-apolo` (já criada, com a spec).

**Comandos:** testes `npx vitest run <arquivo>`; tudo `npm test`; tipos `npx tsc -b`; lint `npx eslint .`; build `npm run build`. Terminal do Daniel é PowerShell 5.1 (sem `&&`).

**Dados reais:** nunca use nomes de pacientes reais em testes ou na Demo; use nomes fictícios.

---

## Estrutura de arquivos

- Criar `api/_lib/agenda-sadt.ts` — puras: nomes, leitura dos itens da agenda, separação e cruzamento.
- Criar `api/_lib/agenda-sadt.test.ts`.
- Criar `api/_lib/ninsaude.ts` — token + listagem da agenda; nunca lança.
- Criar `api/_lib/ninsaude.test.ts`.
- Modificar `api/_lib/painel-sadt.ts` — registro lê `nomeNaGuia`/`carteira`; `montarPainel` recebe a agenda e devolve `agenda`; `hojeEmBrasilia`.
- Modificar `api/_lib/painel-sadt.test.ts`.
- Modificar `api/sadt.ts` — busca a agenda em paralelo.
- Modificar `src/lib/painel.ts` (+ `src/lib/painel.test.ts`) — tipos espelhados e `agendaCompleta`.
- Modificar `src/components/PainelSadtScreen.tsx` — placar, seções novas, aviso de data diferente, faixa de indisponível.
- Modificar `src/dev/Demo.tsx` — PAINEL com agenda e caso sem agenda.

---

### Task 1: Nomes e separação da agenda

**Files:**
- Create: `api/_lib/agenda-sadt.ts`
- Test: `api/_lib/agenda-sadt.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// api/_lib/agenda-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { ehMedsenior, mesmaPaciente, normalizarNome, separarAgenda } from './agenda-sadt.js';

function item(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    data: '2026-09-10',
    pacienteNome: 'Maria Exemplo Souza',
    status: 3,
    servicoDescricao: 'Consulta Cirurgia',
    convenioId: 4,
    convenioTitulo: 'MEDSENIOR',
    convenioCarteira: '2000000000001',
    ...extra,
  };
}

describe('normalizarNome', () => {
  it('tira acento, caixa, pontuação e espaço repetido', () => {
    expect(normalizarNome('  Márcia   de Sant’Anna-Lima ')).toBe('MARCIA DE SANTANNA LIMA');
  });
});

describe('mesmaPaciente', () => {
  it('aceita igual ignorando acento e caixa', () => {
    expect(mesmaPaciente('MARIA EXEMPLO SOUZA', 'Maria Exemplo Souza')).toBe(true);
  });
  it('aceita o nome mais curto como prefixo com até 1 palavra a menos e pelo menos 3 palavras', () => {
    expect(mesmaPaciente('Ana Paula Modelo', 'ANA PAULA MODELO LIMA')).toBe(true);
  });
  it('recusa faltando 2 palavras, primeiro nome trocado ou nome curto demais', () => {
    expect(mesmaPaciente('Ana Paula', 'ANA PAULA MODELO LIMA')).toBe(false);
    expect(mesmaPaciente('Ana Paula Modelo', 'Paula Modelo Lima')).toBe(false);
    expect(mesmaPaciente('Ana', 'Ana')).toBe(false);
  });
});

describe('ehMedsenior', () => {
  it('reconhece pelo id 4 ou pelo título', () => {
    expect(ehMedsenior(4, null)).toBe(true);
    expect(ehMedsenior(null, 'Med Sênior')).toBe(true);
    expect(ehMedsenior(1, 'AMIL')).toBe(false);
    expect(ehMedsenior(null, null)).toBe(false);
  });
});

describe('separarAgenda', () => {
  it('atendidos de qualquer convênio, marcando quais são MedSênior', () => {
    const r = separarAgenda(
      [item(), item({ id: 2, pacienteNome: 'Bruna Teste Lima', convenioId: null, convenioTitulo: null, convenioCarteira: null })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([
      { id: '2', data: '2026-09-10', paciente: 'Bruna Teste Lima', servico: 'Consulta Cirurgia', convenio: null, medsenior: false, carteira: null },
      { id: '1', data: '2026-09-10', paciente: 'Maria Exemplo Souza', servico: 'Consulta Cirurgia', convenio: 'MEDSENIOR', medsenior: true, carteira: '2000000000001' },
    ]);
  });

  it('fora do mês, falta, cancelada e reagendada não entram', () => {
    const r = separarAgenda(
      [item({ data: '2026-08-31' }), item({ id: 2, status: 4 }), item({ id: 3, status: 5 }), item({ id: 4, status: 7 })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([]);
    expect(r.semBaixa).toEqual([]);
  });

  it('sem baixa: MedSênior agendada ou confirmada antes de hoje', () => {
    const r = separarAgenda(
      [
        item({ id: 1, status: 0, data: '2026-09-29' }),
        item({ id: 2, status: 2, data: '2026-09-30' }),
        item({ id: 3, status: 0, data: '2026-09-30', convenioId: 1, convenioTitulo: 'AMIL' }),
      ],
      '2026-09',
      '2026-09-30',
    );
    expect(r.semBaixa).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-29', servico: 'Consulta Cirurgia', status: 'agendada' }]);
  });

  it('carteira numérica vira texto só com dígitos; item fora do formato é ignorado', () => {
    const r = separarAgenda([item({ convenioCarteira: 2000000000001 }), { lixo: true }], '2026-09', '2026-10-03');
    expect(r.atendidos.map((a) => a.carteira)).toEqual(['2000000000001']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/agenda-sadt.test.ts`
Expected: FAIL — `Failed to resolve import "./agenda-sadt.js"`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/agenda-sadt.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/agenda-sadt.ts api/_lib/agenda-sadt.test.ts
git commit -m "feat(painel): separa os atendimentos da agenda do Apolo"
```

---

### Task 2: Cruzamento atendimento × registro

**Files:**
- Modify: `api/_lib/agenda-sadt.ts` (acrescentar no fim)
- Test: `api/_lib/agenda-sadt.test.ts` (acrescentar)

- [ ] **Step 1: Write the failing tests** (acrescente o import de `cruzarAgenda` e `type Atendimento` no topo do arquivo de teste e este bloco no fim)

```ts
// no topo: import { cruzarAgenda, ehMedsenior, mesmaPaciente, normalizarNome, separarAgenda, type Atendimento } from './agenda-sadt.js';

function atendido(paciente: string, data: string, extra: Partial<Atendimento> = {}): Atendimento {
  return { id: `${paciente}-${data}`, data, paciente, servico: 'Consulta Cirurgia', convenio: 'MEDSENIOR', medsenior: true, carteira: null, ...extra };
}

function reg(chave: string, paciente: string, data: string, extra: Record<string, unknown> = {}) {
  return { chave, paciente, nomeNaGuia: paciente.toUpperCase(), carteira: null, data, faturada: true, ...extra };
}

describe('cruzarAgenda', () => {
  it('casa no mesmo dia e conta digitalizadas e faturadas', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-10'), atendido('Bruna Teste Lima', '2026-09-11')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-10'), reg('b.json', 'Bruna Teste Lima', '2026-09-11', { faturada: false })],
    );
    expect(b).toMatchObject({ disponivel: true, atendidas: 2, digitalizadas: 2, faturadas: 1, semGuia: [], guiaSemAtendimento: [], dataDiferente: [], convenioErrado: [] });
  });

  it('atendida sem guia e guia sem atendimento', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-10')],
      [],
      [reg('x.json', 'Carla Outra Pessoa', '2026-09-12')],
    );
    expect(b.semGuia).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-10', servico: 'Consulta Cirurgia' }]);
    expect(b.guiaSemAtendimento).toEqual([{ chave: 'x.json', paciente: 'Carla Outra Pessoa', data: '2026-09-12' }]);
    expect(b.digitalizadas).toBe(0);
  });

  it('até 3 dias de diferença casa com aviso; 4 dias não casa', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-16'), atendido('Bruna Teste Lima', '2026-09-20')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-18'), reg('b.json', 'Bruna Teste Lima', '2026-09-24')],
    );
    expect(b.dataDiferente).toEqual([{ chave: 'a.json', dataAgenda: '2026-09-16' }]);
    expect(b.guiaSemAtendimento.map((g) => g.chave)).toEqual(['b.json']);
  });

  it('dois atendimentos da mesma paciente precisam de duas guias', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-03'), atendido('Maria Exemplo Souza', '2026-09-24')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-24')],
    );
    expect(b.semGuia).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-03', servico: 'Consulta Cirurgia' }]);
  });

  it('casa pelo nome da pasta, pelo nome na guia ou pela carteirinha', () => {
    const b = cruzarAgenda(
      [
        atendido('Ana Paula Modelo Oliveira', '2026-09-01'),
        atendido('Beatriz Exemplo', '2026-09-02', { carteira: '2000000000077' }),
      ],
      [],
      [
        reg('a.json', 'Ana paula Modelo', '2026-09-01', { nomeNaGuia: 'NOME LIDO ERRADO' }),
        reg('b.json', 'Beatriz Lida Errado', '2026-09-02', { nomeNaGuia: null, carteira: '2000000000077' }),
      ],
    );
    expect(b.digitalizadas).toBe(2);
  });

  it('atendimento de outro convênio só entra quando casa com guia, como convênio errado', () => {
    const b = cruzarAgenda(
      [
        atendido('Maria Exemplo Souza', '2026-09-10', { medsenior: false, convenio: null }),
        atendido('Paciente Amil Exemplo', '2026-09-10', { medsenior: false, convenio: 'AMIL' }),
      ],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-10')],
    );
    expect(b.atendidas).toBe(1);
    expect(b.digitalizadas).toBe(1);
    expect(b.semGuia).toEqual([]);
    expect(b.convenioErrado).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-10', convenio: null }]);
  });

  it('repassa as consultas sem baixa', () => {
    const semBaixa = [{ paciente: 'Maria Exemplo Souza', data: '2026-09-29', servico: null, status: 'agendada' as const }];
    expect(cruzarAgenda([], semBaixa, []).semBaixa).toEqual(semBaixa);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/agenda-sadt.test.ts`
Expected: FAIL — `cruzarAgenda is not a function` (ou erro de import).

- [ ] **Step 3: Implement** (acrescente ao fim de `api/_lib/agenda-sadt.ts`)

```ts
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
  const par = new Map<string, RegistroCruzamento>();

  for (const a of ordem) {
    const r = registros.find((r) => livres.has(r.chave) && r.data === a.data && mesmaPessoa(a, r));
    if (r) {
      par.set(a.id, r);
      livres.delete(r.chave);
    }
  }
  const dataDiferente: BlocoAgenda['dataDiferente'] = [];
  for (const a of ordem) {
    if (par.has(a.id)) continue;
    const perto = registros
      .filter((r) => livres.has(r.chave) && distanciaEmDias(r.data, a.data) <= MAX_DIAS && mesmaPessoa(a, r))
      .sort((x, y) => distanciaEmDias(x.data, a.data) - distanciaEmDias(y.data, a.data))[0];
    if (perto) {
      par.set(a.id, perto);
      livres.delete(perto.chave);
      dataDiferente.push({ chave: perto.chave, dataAgenda: a.data });
    }
  }

  const contados = atendidos.filter((a) => a.medsenior || par.has(a.id));
  const casados = contados.filter((a) => par.has(a.id));
  return {
    disponivel: true,
    atendidas: contados.length,
    digitalizadas: casados.length,
    faturadas: casados.filter((a) => par.get(a.id)?.faturada).length,
    semGuia: atendidos
      .filter((a) => a.medsenior && !par.has(a.id))
      .map((a) => ({ paciente: a.paciente, data: a.data, servico: a.servico })),
    semBaixa,
    guiaSemAtendimento: registros
      .filter((r) => livres.has(r.chave))
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((r) => ({ chave: r.chave, paciente: r.paciente, data: r.data })),
    convenioErrado: atendidos
      .filter((a) => !a.medsenior && par.has(a.id))
      .map((a) => ({ paciente: a.paciente, data: a.data, convenio: a.convenio })),
    dataDiferente,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/agenda-sadt.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/agenda-sadt.ts api/_lib/agenda-sadt.test.ts
git commit -m "feat(painel): cruza atendimentos da agenda com as guias do mês"
```

---

### Task 3: Cliente da API do NinSaúde

**Files:**
- Create: `api/_lib/ninsaude.ts`
- Test: `api/_lib/ninsaude.test.ts`

Receita (igual ao VitaZap, `femme-vita-agente/lib/ninsaude/auth.ts` e `agenda.ts`): token por `POST /v1/oauth2/token` com header **`X-Grant-Type: refresh_token`**; agenda por `GET /v1/atendimento_agenda/listar` com **`Authorization: bearer <access>` em minúsculo**.

- [ ] **Step 1: Write the failing tests**

```ts
// api/_lib/ninsaude.test.ts
import { describe, expect, it, vi } from 'vitest';
import { lerAgendaNinsaude } from './ninsaude.js';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('lerAgendaNinsaude', () => {
  it('sem token configurado não chama a API', async () => {
    const buscar = vi.fn();
    expect(await lerAgendaNinsaude(undefined, '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'token do NinSaúde não configurado' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('troca o refresh com X-Grant-Type e lê a agenda com bearer minúsculo', async () => {
    const buscar = vi.fn(async (url: string) =>
      url.includes('oauth2/token') ? json({ access_token: 'ACESSO' }) : json({ result: [{ id: 1 }] }),
    );
    const r = await lerAgendaNinsaude('REFRESH', '2026-09-01', '2026-09-30', buscar);
    expect(r).toEqual({ ok: true, itens: [{ id: 1 }] });
    const [urlToken, initToken] = buscar.mock.calls[0] as [string, RequestInit];
    expect(urlToken).toBe('https://api.ninsaude.com/v1/oauth2/token');
    expect((initToken.headers as Record<string, string>)['X-Grant-Type']).toBe('refresh_token');
    expect(String(initToken.body)).toContain('refresh_token=REFRESH');
    const [urlAgenda, initAgenda] = buscar.mock.calls[1] as [string, RequestInit];
    expect(urlAgenda).toBe('https://api.ninsaude.com/v1/atendimento_agenda/listar?dataInicial=2026-09-01&dataFinal=2026-09-30');
    expect((initAgenda.headers as Record<string, string>).Authorization).toBe('bearer ACESSO');
  });

  it('token recusado', async () => {
    const buscar = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'o NinSaúde recusou o token (HTTP 400)' });
  });

  it('agenda recusada ou sem result', async () => {
    const recusa = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'A' }) : json({}, 401)));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', recusa)).toEqual({ ok: false, motivo: 'o NinSaúde recusou a leitura da agenda (HTTP 401)' });
    const semResult = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'A' }) : json({ outra: 1 })));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', semResult)).toEqual({ ok: false, motivo: 'a agenda veio num formato inesperado' });
  });

  it('rede fora do ar', async () => {
    const buscar = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'o NinSaúde não respondeu' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/ninsaude.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Implement**

```ts
// api/_lib/ninsaude.ts
const URL_TOKEN = 'https://api.ninsaude.com/v1/oauth2/token';
const URL_AGENDA = 'https://api.ninsaude.com/v1/atendimento_agenda/listar';
const TEMPO_MAXIMO_MS = 12000;

export type ResultadoAgenda = { ok: true; itens: unknown[] } | { ok: false; motivo: string };
type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Agenda do período no NinSaúde (Apolo). Mesma receita do VitaZap: o token exige o
 * header `X-Grant-Type`, e a leitura usa `bearer` minúsculo (maiúsculo dá 401).
 * Nunca lança: sem agenda, o painel continua mostrando o que vem do Drive.
 */
export async function lerAgendaNinsaude(
  refreshToken: string | undefined,
  inicio: string,
  fim: string,
  buscar: Buscar = fetch,
): Promise<ResultadoAgenda> {
  if (!refreshToken) return { ok: false, motivo: 'token do NinSaúde não configurado' };
  try {
    const token = await buscar(URL_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'cache-control': 'no-cache',
        'X-Grant-Type': 'refresh_token',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!token.ok) return { ok: false, motivo: `o NinSaúde recusou o token (HTTP ${token.status})` };
    const acesso = ((await token.json().catch(() => ({}))) as { access_token?: string }).access_token;
    if (!acesso) return { ok: false, motivo: 'o NinSaúde não devolveu o token de acesso' };

    const agenda = await buscar(`${URL_AGENDA}?dataInicial=${inicio}&dataFinal=${fim}`, {
      headers: { Authorization: `bearer ${acesso}` },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!agenda.ok) return { ok: false, motivo: `o NinSaúde recusou a leitura da agenda (HTTP ${agenda.status})` };
    const corpo = (await agenda.json().catch(() => null)) as { result?: unknown } | null;
    if (!corpo || !Array.isArray(corpo.result)) return { ok: false, motivo: 'a agenda veio num formato inesperado' };
    return { ok: true, itens: corpo.result };
  } catch {
    return { ok: false, motivo: 'o NinSaúde não respondeu' };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/ninsaude.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/ninsaude.ts api/_lib/ninsaude.test.ts
git commit -m "feat(painel): lê a agenda do mês na API do NinSaúde"
```

---

### Task 4: `montarPainel` com a agenda e a rota

**Files:**
- Modify: `api/_lib/painel-sadt.ts`
- Modify: `api/sadt.ts`
- Test: `api/_lib/painel-sadt.test.ts`

- [ ] **Step 1: Write the failing tests** (acrescente `hojeEmBrasilia` ao import de `./painel-sadt.js` e este bloco no fim do arquivo; o helper `registro(paciente, data, pdfId)` já existe no topo)

```ts
describe('montarPainel com a agenda', () => {
  const agendaItem = (pacienteNome: string, data: string, status = 3) => ({
    id: `${pacienteNome}-${data}`,
    data,
    pacienteNome,
    status,
    servicoDescricao: 'Consulta Cirurgia',
    convenioId: 4,
    convenioTitulo: 'MEDSENIOR',
    convenioCarteira: null,
  });

  it('sem agenda informada, o bloco diz que a conferência está desligada', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [], livro: null, pdfs: [] });
    expect(painel.agenda).toEqual({ disponivel: false, motivo: 'conferência com a agenda desligada' });
  });

  it('agenda indisponível repassa o motivo', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [], livro: null, pdfs: [], agenda: { ok: false, motivo: 'o NinSaúde não respondeu' }, hoje: '2026-10-03' });
    expect(painel.agenda).toEqual({ disponivel: false, motivo: 'o NinSaúde não respondeu' });
  });

  it('cruza a agenda com os registros e usa o livro para saber o que foi faturado', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('Maria Exemplo Souza', '2026-09-10', 'p1') },
        { nome: 'b.json', conteudo: registro('Bruna Teste Lima', '2026-09-11', 'p2') },
        { nome: 'ruim.json', conteudo: null },
      ],
      livro: livro({ 'a.json': entrada('faturada', { guiaPortal: '3000001', valor: 82.02 }) }),
      pdfs: [],
      agenda: {
        ok: true,
        itens: [agendaItem('Maria Exemplo Souza', '2026-09-10'), agendaItem('Bruna Teste Lima', '2026-09-11'), agendaItem('Carla Sem Guia', '2026-09-12')],
      },
      hoje: '2026-10-03',
    });
    expect(painel.agenda).toMatchObject({
      disponivel: true,
      atendidas: 3,
      digitalizadas: 2,
      faturadas: 1,
      semGuia: [{ paciente: 'Carla Sem Guia', data: '2026-09-12', servico: 'Consulta Cirurgia' }],
      guiaSemAtendimento: [],
    });
  });
});

describe('hojeEmBrasilia', () => {
  it('usa o fuso de Brasília, não o UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-02');
    expect(hojeEmBrasilia(new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-03');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/painel-sadt.test.ts`
Expected: FAIL — `painel.agenda` indefinido / `hojeEmBrasilia` não exportado.

- [ ] **Step 3: Implement in `api/_lib/painel-sadt.ts`**

3a. Imports no topo (depois do import do zod):

```ts
import { cruzarAgenda, separarAgenda, type BlocoAgenda } from './agenda-sadt.js';
import type { ResultadoAgenda } from './ninsaude.js';
```

3b. Tipo novo e campo no `PainelSadt` (logo antes de `export type PainelSadt`):

```ts
export type AgendaPainel = { disponivel: false; motivo: string } | BlocoAgenda;
```

e dentro de `PainelSadt`, depois de `avisoLivro: string | null;`:

```ts
  agenda: AgendaPainel;
```

3c. `RegistroLeitura` passa a ler os dois campos do cruzamento:

```ts
const RegistroLeitura = z.object({
  paciente: z.string().min(1),
  nomeNaGuia: z.string().optional(),
  carteira: z.string().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pdf: z.object({ id: z.string().min(1) }),
  digitalizadoPor: z.string().optional(),
});
```

3d. Assinatura de `montarPainel`:

```ts
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
```

3e. Dentro do laço dos registros, guarde os dados do cruzamento. Declare antes do laço:

```ts
  const paraCruzar: { chave: string; paciente: string; nomeNaGuia: string | null; carteira: string | null; data: string; faturada: boolean }[] = [];
```

e, logo depois do `guias.push({...})` do registro válido (o que usa `reg.data`), acrescente:

```ts
    paraCruzar.push({
      chave: nome,
      paciente: reg.data.paciente,
      nomeNaGuia: reg.data.nomeNaGuia ?? null,
      carteira: reg.data.carteira ?? null,
      data: reg.data.data,
      faturada: anotado?.status === 'faturada',
    });
```

3f. Antes do `return`, monte o bloco:

```ts
  let agenda: AgendaPainel = { disponivel: false, motivo: 'conferência com a agenda desligada' };
  if (entrada.agenda && !entrada.agenda.ok) agenda = { disponivel: false, motivo: entrada.agenda.motivo };
  if (entrada.agenda?.ok) {
    const { atendidos, semBaixa } = separarAgenda(entrada.agenda.itens, entrada.mes, entrada.hoje ?? hojeEmBrasilia());
    agenda = cruzarAgenda(atendidos, semBaixa, paraCruzar);
  }
```

e no objeto devolvido, depois de `avisoLivro,`:

```ts
    agenda,
```

3g. No fim do arquivo:

```ts
/** AAAA-MM-DD no fuso de Brasília (a função roda em UTC na Vercel). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/painel-sadt.test.ts`
Expected: PASS (todos os anteriores + 4 novos).

- [ ] **Step 5: Wire `api/sadt.ts`**

Acrescente o import:

```ts
import { lerAgendaNinsaude } from './_lib/ninsaude.js';
```

troque a linha `import { mapearComLimite, montarPainel } from './_lib/painel-sadt.js';` por:

```ts
import { hojeEmBrasilia, mapearComLimite, montarPainel } from './_lib/painel-sadt.js';
```

troque o `Promise.all` de `[registros, livro, pdfs]` por (mesmo conteúdo + a agenda no fim):

```ts
    const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    const [registros, livro, pdfs, agenda] = await Promise.all([
      mapearComLimite(arquivosDeRegistro, 8, async (a) => ({ nome: a.name, conteudo: await baixarJson(accessToken, a) })),
      // Livro que existe mas não abre não pode virar "sem livro" (tudo como "falta
      // faturar", R$ 0): um objeto inválido faz montarPainel mostrar o aviso do livro.
      arquivoDoLivro
        ? baixarJson(accessToken, arquivoDoLivro).then((livro) => livro ?? { livroIlegivel: true })
        : Promise.resolve(null),
      findFilesByNamePrefix(accessToken, 'Guia_SADT_', 'application/pdf'),
      lerAgendaNinsaude(process.env.NINSAUDE_REFRESH_TOKEN, `${mes}-01`, `${mes}-${String(ultimoDia).padStart(2, '0')}`),
    ]);
```

e no `montarPainel({...})` acrescente depois de `pdfs: ...`:

```ts
        agenda,
        hoje: hojeEmBrasilia(),
```

- [ ] **Step 6: Typecheck and full tests**

Run: `npx tsc -b` → sem saída. Run: `npm test` → todos passam.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/painel-sadt.ts api/_lib/painel-sadt.test.ts api/sadt.ts
git commit -m "feat(painel): painel SADT traz a conferência com a agenda do Apolo"
```

---

### Task 5: Tela — placar, seções e Demo

**Files:**
- Modify: `src/lib/painel.ts`
- Test: `src/lib/painel.test.ts`
- Modify: `src/components/PainelSadtScreen.tsx`
- Modify: `src/dev/Demo.tsx`

- [ ] **Step 1: Write the failing test** (acrescente a `src/lib/painel.test.ts`, importando `agendaCompleta` e `type AgendaPainel` de `./painel`)

```ts
describe('agendaCompleta', () => {
  const base: AgendaPainel = {
    disponivel: true, atendidas: 2, digitalizadas: 2, faturadas: 2,
    semGuia: [], semBaixa: [], guiaSemAtendimento: [], convenioErrado: [], dataDiferente: [],
  };
  it('verde só com tudo digitalizado e faturado, sem baixa pendente nem guia solta', () => {
    expect(agendaCompleta(base)).toBe(true);
    expect(agendaCompleta({ ...base, faturadas: 1 })).toBe(false);
    expect(agendaCompleta({ ...base, semBaixa: [{ paciente: 'X Y Z', data: '2026-09-01', servico: null, status: 'agendada' }] })).toBe(false);
    expect(agendaCompleta({ ...base, guiaSemAtendimento: [{ chave: 'a.json', paciente: 'X Y Z', data: '2026-09-01' }] })).toBe(false);
    expect(agendaCompleta({ ...base, atendidas: 0, digitalizadas: 0, faturadas: 0 })).toBe(false);
    expect(agendaCompleta({ disponivel: false, motivo: 'x' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/painel.test.ts`
Expected: FAIL — `agendaCompleta` não exportado.

- [ ] **Step 3: Implement in `src/lib/painel.ts`**

Depois do tipo `GuiaPainel`:

```ts
export type AgendaPainel =
  | { disponivel: false; motivo: string }
  | {
      disponivel: true;
      atendidas: number;
      digitalizadas: number;
      faturadas: number;
      semGuia: { paciente: string; data: string; servico: string | null }[];
      semBaixa: { paciente: string; data: string; servico: string | null; status: 'agendada' | 'confirmada' }[];
      guiaSemAtendimento: { chave: string; paciente: string; data: string | null }[];
      convenioErrado: { paciente: string; data: string; convenio: string | null }[];
      dataDiferente: { chave: string; dataAgenda: string }[];
    };
```

No tipo `PainelSadt`, depois de `avisoLivro: string | null;`:

```ts
  agenda: AgendaPainel;
```

No fim do arquivo:

```ts
/** Placar verde: todo atendimento do mês digitalizado e faturado, sem nada solto. */
export function agendaCompleta(agenda: AgendaPainel): boolean {
  if (!agenda.disponivel || agenda.atendidas === 0) return false;
  return (
    agenda.digitalizadas === agenda.atendidas &&
    agenda.faturadas === agenda.atendidas &&
    agenda.semBaixa.length === 0 &&
    agenda.guiaSemAtendimento.length === 0
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/painel.test.ts` → PASS.

- [ ] **Step 5: Tela (`src/components/PainelSadtScreen.tsx`)**

5a. No import de `../lib/painel`, acrescente `agendaCompleta` e `type AgendaPainel`.

5b. Em `Conteudo`, logo depois do `<dl>…</dl>` dos totais, acrescente:

```tsx
      <ConferenciaAgenda agenda={painel.agenda} />
```

5c. Na lista das guias, passe a data da agenda quando difere. Troque `<LinhaGuia key={guia.chave} guia={guia} />` por:

```tsx
                <LinhaGuia key={guia.chave} guia={guia} dataAgenda={dataNaAgenda.get(guia.chave)} />
```

e no início de `Conteudo` (depois de `const vazio = ...`):

```tsx
  const dataNaAgenda = new Map(painel.agenda.disponivel ? painel.agenda.dataDiferente.map((d) => [d.chave, d.dataAgenda]) : []);
```

5d. `LinhaGuia` ganha o aviso:

```tsx
function LinhaGuia({ guia, dataAgenda }: { guia: GuiaPainel; dataAgenda?: string }) {
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
      <span className="font-mono text-[12px] tabular-nums text-navy/50">
        {guia.data ? isoParaDataBr(guia.data).slice(0, 5) : '—'}
      </span>
      <div className="min-w-0">
        <p className="truncate font-serif text-lg leading-snug text-navy">{guia.paciente}</p>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaGuia(guia)}</p>
        {dataAgenda && (
          <p className="mt-0.5 text-[13px] leading-snug text-amber-600">
            Na agenda do Apolo a consulta é de {isoParaDataBr(dataAgenda).slice(0, 5)}: confira a data da guia.
          </p>
        )}
      </div>
      {guia.pdfId ? <LinkPdf href={`https://drive.google.com/file/d/${guia.pdfId}/view`} /> : <span />}
    </li>
  );
}
```

5e. Componentes novos (antes de `function Total`):

```tsx
/** Placar contra a agenda do Apolo e o que falta para fechar 100% do mês. */
function ConferenciaAgenda({ agenda }: { agenda: AgendaPainel }) {
  if (!agenda.disponivel) {
    return (
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-navy/45">
        Conferência com a agenda do Apolo indisponível: {agenda.motivo}.
      </p>
    );
  }
  const completo = agendaCompleta(agenda);
  return (
    <>
      <section
        aria-label="Conferência com a agenda do Apolo"
        className={`mt-4 rounded-2xl border p-4 shadow-soft animate-slide-in ${completo ? 'border-success/40 bg-success/8' : 'border-navy/10 bg-bone-50'}`}
      >
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy/45">Agenda do Apolo</p>
        <p className={`mt-1 font-serif text-xl leading-snug ${completo ? 'text-success' : 'text-navy'}`}>
          {agenda.atendidas} atendida{agenda.atendidas === 1 ? '' : 's'} · digitalizadas {agenda.digitalizadas} de {agenda.atendidas} · faturadas {agenda.faturadas} de {agenda.atendidas}
        </p>
        {completo && <p className="mt-1 text-[13px] text-success">Mês completo: todo atendimento MedSênior tem guia faturada.</p>}
      </section>

      <ListaAgenda
        rotulo="Atendida sem guia"
        ponto="bg-danger"
        texto="text-danger"
        explica="Atendimento MedSênior com baixa no Apolo e nenhuma guia digitalizada. Digitalize a guia desta paciente."
        linhas={agenda.semGuia.map((a) => ({ chave: `${a.paciente}-${a.data}`, data: a.data, nome: a.paciente, detalhe: a.servico ?? '' }))}
      />
      <ListaAgenda
        rotulo="Sem baixa no Apolo"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Consulta MedSênior que já passou e continua agendada ou confirmada. Dê baixa (atendida ou falta) no Apolo."
        linhas={agenda.semBaixa.map((a) => ({ chave: `${a.paciente}-${a.data}`, data: a.data, nome: a.paciente, detalhe: [a.status, a.servico].filter(Boolean).join(' · ') }))}
      />
      <ListaAgenda
        rotulo="Guia sem atendimento na agenda"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Guia digitalizada sem consulta atendida da paciente perto dessa data no Apolo. Confira a data da guia ou a agenda."
        linhas={agenda.guiaSemAtendimento.map((g) => ({ chave: g.chave, data: g.data, nome: g.paciente, detalhe: '' }))}
      />
      <ListaAgenda
        rotulo="Convênio errado no Apolo"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Tem guia MedSênior, mas no Apolo a consulta está com outro convênio ou sem convênio. Corrija o cadastro da consulta."
        linhas={agenda.convenioErrado.map((a) => ({ chave: `${a.paciente}-${a.data}`, data: a.data, nome: a.paciente, detalhe: a.convenio ?? 'sem convênio' }))}
      />
    </>
  );
}

function ListaAgenda({
  rotulo,
  ponto,
  texto,
  explica,
  linhas,
}: {
  rotulo: string;
  ponto: string;
  texto: string;
  explica: string;
  linhas: { chave: string; data: string | null; nome: string; detalhe: string }[];
}) {
  if (linhas.length === 0) return null;
  return (
    <section className="mt-10 animate-slide-in">
      <CabecalhoSecao ponto={ponto} texto={texto} rotulo={rotulo} quantidade={linhas.length}>
        {explica}
      </CabecalhoSecao>
      <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
        {linhas.map((l) => (
          <li key={l.chave} className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
            <span className="font-mono text-[12px] tabular-nums text-navy/50">{l.data ? isoParaDataBr(l.data).slice(0, 5) : '—'}</span>
            <div className="min-w-0">
              <p className="truncate font-serif text-lg leading-snug text-navy">{l.nome}</p>
              {l.detalhe && <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{l.detalhe}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Demo (`src/dev/Demo.tsx`)** — nomes fictícios.

No objeto `PAINEL`, depois de `avisoLivro: null,`:

```ts
  agenda: {
    disponivel: true,
    atendidas: 8,
    digitalizadas: 6,
    faturadas: 2,
    semGuia: [{ paciente: 'Gabriela Inventada Rocha', data: '2026-09-03', servico: 'Retorno Histeroscopia' }],
    semBaixa: [{ paciente: 'Helena Exemplo Dias', data: '2026-09-29', servico: 'Consulta rotina', status: 'confirmada' }],
    guiaSemAtendimento: [],
    convenioErrado: [{ paciente: 'Carla Demonstração Reis', data: '2026-09-15', convenio: null }],
    dataDiferente: [{ chave: 'c.json', dataAgenda: '2026-09-08' }],
  },
```

No caso `'painel-sadt-vazio'`, acrescente ao objeto devolvido `agenda: { disponivel: false, motivo: 'token do NinSaúde não configurado' },`. Acrescente um caso novo antes de `default:`:

```tsx
    case 'painel-sadt-completo':
      return (
        <PainelSadtScreen
          mesInicial="2026-09"
          carregar={async () => ({
            ...PAINEL,
            agenda: { disponivel: true, atendidas: 6, digitalizadas: 6, faturadas: 6, semGuia: [], semBaixa: [], guiaSemAtendimento: [], convenioErrado: [], dataDiferente: [] },
          })}
        />
      );
```

e inclua `painel-sadt-completo` na linha de texto "Demos: …".

- [ ] **Step 7: Verify**

Run: `npx tsc -b` → sem saída; `npx eslint .` → sem erros; `npm test` → tudo passa; `npm run build` → "built".
Abra o servidor de desenvolvimento (`preview_start` com o nome `arquivo` do `.claude/launch.json` do projeto `Claude_Femme_Vita`) e confira `/?demo=painel-sadt`, `/?demo=painel-sadt-completo` e `/?demo=painel-sadt-vazio` em largura de celular (375 px): placar, seções novas, aviso de data diferente na guia de Beatriz Modelo Costa, faixa de indisponível no vazio, sem rolagem horizontal.

- [ ] **Step 8: Commit**

```bash
git add src/lib/painel.ts src/lib/painel.test.ts src/components/PainelSadtScreen.tsx src/dev/Demo.tsx
git commit -m "feat(painel): placar e seções da conferência com a agenda do Apolo"
```

---

### Task 6: Conferência real de setembro e publicação

**Files:** nenhum arquivo do repositório (script temporário no scratchpad da sessão).

- [ ] **Step 1: Rodar a montagem real fora da Vercel.** Script `.mts` no scratchpad, executado com `npx tsx` a partir de `C:\Users\User\Developer\femme-vita-app`, que: lê `NINSAUDE_REFRESH_TOKEN` de `C:\Users\User\Developer\femme-vita-agente\.env.local` (sem imprimir); chama `lerAgendaNinsaude` para `2026-09-01..2026-09-30`; lê os registros `G:\Meu Drive\Apolo\_SADT\2026.09\*.json` (menos os que começam com `_`) e o `_faturamento.json`; chama `montarPainel({ mes: '2026-09', registros, livro, pdfs: [], agenda, hoje: '2026-10-03' })` e imprime `painel.agenda`.

Expected (spec, protótipo de 03/10/2026): `atendidas` 61, `digitalizadas` 60, `faturadas` 60; `semGuia` = Maria De Fátima L Moreira 03/09; `guiaSemAtendimento` = Marcia Carmo da Silveira (21/09) e Nilce Coelho Perorazio (23/09); `convenioErrado` = 4 (Ana Paula Rodrigues Lopes, Jacqueline Baptista, Judite Pereira Sanches, Maria Lucia Alencar). Qualquer diferença: investigar antes de seguir.

- [ ] **Step 2: Publicar só com o OK do Daniel.** Merge fast-forward de `painel-agenda-apolo` na `main` e `git push origin main` (a Vercel publica). O `NINSAUDE_REFRESH_TOKEN` já está no projeto `femme-vita-app` (produção, Sensitive) desde 03/10/2026.

- [ ] **Step 3: Conferir em produção.** Bundle novo publicado (procurar "Agenda do Apolo" no JS de `https://femme-vita-app.vercel.app`) e o Daniel abre o painel de setembro pelo Hub: placar 61 · 60 de 61 · 60 de 61.
