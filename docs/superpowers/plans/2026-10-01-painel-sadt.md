# Painel de faturamento SADT — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página no Arquivo (`?tela=faturamento-sadt`) mostra o mês das guias SADT: o que foi digitalizado, o que o robô já faturou, o que falta e as pendências, com o comando do robô pronto para copiar. O Hub ganha o card "Faturamento SADT" (Master).

**Architecture:** `/api/sadt?mes=AAAA-MM` lê pela API do Drive os registros de `Apolo/_SADT/<AAAA.MM>/`, o livro `_faturamento.json` escrito pelo robô e os PDFs `Guia_SADT_*` do mês, e uma função pura (`montarPainel`) junta tudo. A tela é um componente React do próprio Arquivo, com o mesmo login Google. Antes do login, o app guarda `?modo=sadt` ou `?tela=…`, porque o retorno do Google sempre cai em `/`.

**Tech Stack:** Vite + React 19 + Tailwind 4, funções Vercel (`api/`, imports `.js`), Zod 4, Google Drive API v3 via `fetch`, Vitest.

**Pré-requisito:** Tasks 1 a 11 do plano `docs/superpowers/plans/2026-10-01-modo-sadt.md` prontas na branch `modo-sadt` (este plano usa `src/lib/sadt.ts`, `src/dev/Demo.tsx`, `api/_lib/sadt.ts` e `listFileNamesInFolder`). A publicação é a Task 12 daquele plano, rodada depois deste.

**Spec:** `G:\Meu Drive\Pri\PJ\Consultório\Marketing\Claude_Femme_Vita\docs\superpowers\specs\2026-10-01-guias-sadt-medsenior-design.md` (seções 6, 8 e 9).

**Formato do livro (escrito pelo robô `faturar-sadt`):** `{ versao: 1, mes: "2026-09", execucoes: [{ inicio, fim, dryRun, resumo }], guias: { "<nome do registro>.json": { status, paciente, data, guiaPortal, valor, motivo, em } } }`, com `status` em `faturada | finalizando | salva_sem_finalizar | pendencia | duplicada`.

**Direção visual:** a do Arquivo (bone, navy, âmbar; Instrument Serif itálico nos títulos, Geist no corpo, Geist Mono nos números), com a ideia de livro-razão: linhas finas, números tabulares, e uma régua com os dias do mês em que cada guia é um ponto colorido pelo status. A régua é a peça que se lê de longe: um mês todo verde está faturado.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/destino.ts` (novo) | Guarda e restaura `?modo=sadt` / `?tela=faturamento-sadt` em volta do login |
| `api/_lib/painel-sadt.ts` (novo) | `montarPainel`, `pdfDoMes`, `mapearComLimite` (puros) |
| `api/_lib/google.ts` | `findSubfoldersByName`, `listFilesInFolder`, `downloadFileText`, `findFilesByNamePrefix` |
| `api/sadt.ts` (novo) | `GET /api/sadt?mes=AAAA-MM` |
| `src/lib/painel.ts` (novo) | Tipos espelhados, `buscarPainel`, datas de mês, comando do robô |
| `src/components/PainelSadtScreen.tsx` (novo) | A tela |
| `src/App.tsx`, `src/main.tsx`, `src/components/LoginScreen.tsx` | Rota `?tela=faturamento-sadt` e destino do login |
| `src/dev/Demo.tsx` | Vitrine `?demo=painel-sadt` |
| `femme-vita-hub/config/portais.json` | Card "Faturamento SADT" |

---

### Task 1: Destino depois do login

O callback do Google (`api/auth/google.ts`) sempre redireciona para `/`. Quem abre o card "Guias SADT" sem sessão voltaria do login no modo geral. O app guarda o destino no `sessionStorage` antes de sair para o Google e restaura antes de montar o React.

**Files:**
- Create: `src/lib/destino.ts`
- Modify: `src/components/LoginScreen.tsx`, `src/main.tsx`
- Test: `src/lib/destino.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/destino.test.ts
import { describe, expect, it } from 'vitest';
import { destinoParaRestaurar, guardarDestino } from './destino';

function armazenamentoFalso() {
  const dados = new Map<string, string>();
  return {
    dados,
    setItem: (k: string, v: string) => void dados.set(k, v),
  };
}

describe('guardarDestino', () => {
  it('guarda a busca da página antes do login', () => {
    const a = armazenamentoFalso();
    guardarDestino('?modo=sadt', a);
    expect(a.dados.get('fv_destino')).toBe('?modo=sadt');
  });
  it('não guarda nada quando não há busca', () => {
    const a = armazenamentoFalso();
    guardarDestino('', a);
    expect(a.dados.size).toBe(0);
  });
});

describe('destinoParaRestaurar', () => {
  it('restaura os dois destinos conhecidos quando o login voltou para "/"', () => {
    expect(destinoParaRestaurar('', '?modo=sadt')).toBe('?modo=sadt');
    expect(destinoParaRestaurar('', '?tela=faturamento-sadt')).toBe('?tela=faturamento-sadt');
  });
  it('não mexe numa página que já tem busca', () => {
    expect(destinoParaRestaurar('?modo=sadt', '?tela=faturamento-sadt')).toBeNull();
  });
  it('ignora destino desconhecido e ausência de destino', () => {
    expect(destinoParaRestaurar('', '?x=https://evil.example')).toBeNull();
    expect(destinoParaRestaurar('', null)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/destino.test.ts`
Expected: FAIL — `./destino` não existe.

- [ ] **Step 2: Implementar `src/lib/destino.ts`**

```ts
// src/lib/destino.ts
// O retorno do login Google (api/auth/google.ts) sempre cai em "/". Para quem
// entrou por um card do Hub (?modo=sadt, ?tela=faturamento-sadt) não perder o
// caminho, a busca é guardada antes do login e restaurada antes do React montar.

const CHAVE = 'fv_destino';
const CONHECIDOS = new Set(['?modo=sadt', '?tela=faturamento-sadt']);

export function guardarDestino(search: string, armazenamento: Pick<Storage, 'setItem'> = sessionStorage): void {
  if (!search) return;
  try {
    armazenamento.setItem(CHAVE, search);
  } catch {
    // Armazenamento bloqueado: o login funciona do mesmo jeito, só cai em "/".
  }
}

export function destinoParaRestaurar(searchAtual: string, guardado: string | null): string | null {
  if (searchAtual || !guardado) return null;
  return CONHECIDOS.has(guardado) ? guardado : null;
}

/** Chamado em main.tsx antes de renderizar: o App lê o modo da URL uma vez só. */
export function restaurarDestino(): void {
  try {
    const guardado = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    const destino = destinoParaRestaurar(window.location.search, guardado);
    if (destino) window.history.replaceState(null, '', `/${destino}`);
  } catch {
    // Sem sessionStorage: segue no "/".
  }
}
```

Run: `npx vitest run src/lib/destino.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 3: Guardar no clique de "Entrar com Google"**

Em `src/components/LoginScreen.tsx`, acrescentar o import `import { guardarDestino } from '../lib/destino';` e, no `<a … href="/api/auth/google"`, acrescentar a prop:

```tsx
          onClick={() => guardarDestino(window.location.search)}
```

- [ ] **Step 4: Restaurar em `src/main.tsx`**

Acrescentar `import { restaurarDestino } from './lib/destino'` junto dos imports e, logo antes da linha `const demo = …`, a chamada:

```tsx
restaurarDestino()
```

- [ ] **Step 5: Typecheck, lint e testes**

Run: `npx tsc -b && npx eslint src && npx vitest run`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/destino.ts src/lib/destino.test.ts src/components/LoginScreen.tsx src/main.tsx
git commit -m "feat: voltar ao modo SADT ou ao painel depois do login Google"
```

---

### Task 2: Montagem pura do painel

**Files:**
- Create: `api/_lib/painel-sadt.ts`
- Test: `api/_lib/painel-sadt.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// api/_lib/painel-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { mapearComLimite, montarPainel, pdfDoMes } from './painel-sadt.js';

function registro(paciente: string, data: string, pdfId: string) {
  return {
    versao: 1,
    paciente,
    nomeNaGuia: paciente,
    data,
    senha: '10000000001',
    carteira: '2000000000001',
    codigoProcedimento: '98250159',
    pdf: { id: pdfId, nome: `Guia_SADT_${paciente}_${data.replace(/-/g, '.')}.pdf`, pendente: false },
    digitalizadoEm: '2026-09-30T17:00:00.000Z',
    digitalizadoPor: 'recepcao@exemplo.com',
  };
}

function entrada(status: string, extra: Record<string, unknown> = {}) {
  return { status, paciente: 'X', data: '2026-09-30', guiaPortal: null, valor: null, motivo: null, em: 'agora', ...extra };
}

function livro(guias: Record<string, unknown>, execucoes: unknown[] = []) {
  return { versao: 1, mes: '2026-09', execucoes, guias };
}

describe('pdfDoMes', () => {
  it('reconhece o PDF do mês, com ou sem sufixo de colisão', () => {
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.09.30.pdf', '2026-09')).toBe(true);
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.09.30_2.pdf', '2026-09')).toBe(true);
  });
  it('recusa outro mês e outros nomes', () => {
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.10.01.pdf', '2026-09')).toBe(false);
    expect(pdfDoMes('Guia_internação_Ana Lima.pdf', '2026-09')).toBe(false);
  });
});

describe('montarPainel', () => {
  it('registro sem livro é "falta faturar", com o PDF e quem digitalizou', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('ANA', '2026-09-30', 'p1') }],
      livro: null,
      pdfs: [],
    });
    expect(painel.guias).toEqual([
      {
        chave: 'a.json',
        paciente: 'ANA',
        data: '2026-09-30',
        status: 'falta_faturar',
        guiaPortal: null,
        valor: null,
        motivo: null,
        pdfId: 'p1',
        digitalizadoPor: 'recepcao@exemplo.com',
      },
    ]);
    expect(painel.avisoLivro).toBeNull();
  });

  it('traduz cada status do livro', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') },
        { nome: 'b.json', conteudo: registro('B', '2026-09-02', 'p2') },
        { nome: 'c.json', conteudo: registro('C', '2026-09-03', 'p3') },
        { nome: 'd.json', conteudo: registro('D', '2026-09-04', 'p4') },
        { nome: 'e.json', conteudo: registro('E', '2026-09-05', 'p5') },
      ],
      livro: livro({
        'a.json': entrada('faturada', { guiaPortal: '3320311', valor: 82.02 }),
        'b.json': entrada('finalizando', { guiaPortal: '3320312' }),
        'c.json': entrada('salva_sem_finalizar', { guiaPortal: '3320313', motivo: 'Trava 2: x' }),
        'd.json': entrada('pendencia', { motivo: 'Trava 1: y' }),
        'e.json': entrada('duplicada', { motivo: 'mesma senha de a.json' }),
      }),
      pdfs: [],
    });
    expect(painel.guias.map((g) => [g.chave, g.status, g.guiaPortal, g.motivo])).toEqual([
      ['a.json', 'faturada', '3320311', null],
      ['b.json', 'conferir', '3320312', null],
      ['c.json', 'conferir', '3320313', 'Trava 2: x'],
      ['d.json', 'pendencia', null, 'Trava 1: y'],
      ['e.json', 'duplicada', null, 'mesma senha de a.json'],
    ]);
  });

  it('registro que não abre vira "registro ilegível"', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [{ nome: 'ruim.json', conteudo: null }], livro: null, pdfs: [] });
    expect(painel.guias[0]).toMatchObject({ chave: 'ruim.json', paciente: 'ruim.json', status: 'registro_ilegivel', data: null });
  });

  it('livro fora do formato vira aviso, e as guias aparecem como "falta faturar"', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') }],
      livro: { qualquer: 'coisa' },
      pdfs: [],
    });
    expect(painel.avisoLivro).toMatch(/_faturamento\.json/);
    expect(painel.guias[0]?.status).toBe('falta_faturar');
  });

  it('entrada do livro sem registro continua aparecendo', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [],
      livro: livro({ 'sumiu.json': entrada('faturada', { paciente: 'BIA', guiaPortal: '1', valor: 82.02 }) }),
      pdfs: [],
    });
    expect(painel.guias).toEqual([
      expect.objectContaining({ chave: 'sumiu.json', paciente: 'BIA', status: 'faturada', pdfId: null }),
    ]);
  });

  it('acusa PDF do mês sem registro e ignora o de outro mês', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') }],
      livro: null,
      pdfs: [
        { id: 'p1', nome: 'Guia_SADT_A_2026.09.01.pdf', link: 'l1' },
        { id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: 'l9' },
        { id: 'p8', nome: 'Guia_SADT_Y_2026.10.01.pdf', link: 'l8' },
      ],
    });
    expect(painel.pdfsSemRegistro).toEqual([{ id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: 'l9' }]);
  });

  it('ordena por data e depois por nome; ilegível vai para o fim', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'z.json', conteudo: null },
        { nome: 'b.json', conteudo: registro('BRUNA', '2026-09-02', 'p2') },
        { nome: 'a.json', conteudo: registro('ANA', '2026-09-02', 'p1') },
        { nome: 'c.json', conteudo: registro('CARLA', '2026-09-01', 'p3') },
      ],
      livro: null,
      pdfs: [],
    });
    expect(painel.guias.map((g) => g.paciente)).toEqual(['CARLA', 'ANA', 'BRUNA', 'z.json']);
  });

  it('totais e última execução', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') },
        { nome: 'b.json', conteudo: registro('B', '2026-09-02', 'p2') },
        { nome: 'c.json', conteudo: registro('C', '2026-09-03', 'p3') },
        { nome: 'd.json', conteudo: registro('D', '2026-09-04', 'p4') },
      ],
      livro: livro(
        {
          'a.json': entrada('faturada', { guiaPortal: '1', valor: 82.02 }),
          'b.json': entrada('faturada', { guiaPortal: '2', valor: 82.02 }),
          'c.json': entrada('pendencia', { motivo: 'x' }),
        },
        [
          { inicio: '2026-10-02T10:00:00.000Z', fim: '2026-10-02T10:05:00.000Z', dryRun: true, resumo: '3 ensaios ok' },
          { inicio: '2026-10-03T10:00:00.000Z', fim: '2026-10-03T10:06:00.000Z', dryRun: false, resumo: '2 faturadas, 1 pendência' },
        ],
      ),
      pdfs: [{ id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: null }],
    });
    expect(painel.totais).toEqual({
      digitalizadas: 4,
      faturadas: 2,
      valorFaturado: 164.04,
      faltaFaturar: 1,
      atencao: 2,
      duplicadas: 0,
    });
    expect(painel.ultimaExecucao).toEqual({
      inicio: '2026-10-03T10:00:00.000Z',
      fim: '2026-10-03T10:06:00.000Z',
      dryRun: false,
      resumo: '2 faturadas, 1 pendência',
    });
  });
});

describe('mapearComLimite', () => {
  it('preserva a ordem e nunca passa do limite de chamadas simultâneas', async () => {
    let emVoo = 0;
    let pico = 0;
    const resultado = await mapearComLimite([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return n * 10;
    });
    expect(resultado).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(pico).toBeLessThanOrEqual(3);
  });
  it('lista vazia', async () => {
    expect(await mapearComLimite([], 3, async (n: number) => n)).toEqual([]);
  });
});
```

Run: `npx vitest run api/_lib/painel-sadt.test.ts`
Expected: FAIL — `./painel-sadt.js` não existe.

- [ ] **Step 2: Implementar `api/_lib/painel-sadt.ts`**

```ts
// api/_lib/painel-sadt.ts
import { z } from 'zod';

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

export type PainelSadt = {
  mes: string;
  guias: GuiaPainel[];
  pdfsSemRegistro: PdfSemRegistro[];
  ultimaExecucao: ExecucaoPainel | null;
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

/** Só o que o painel usa do registro: leitura tolerante a campos novos. */
const RegistroLeitura = z.object({
  paciente: z.string().min(1),
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

  return {
    mes: entrada.mes,
    guias,
    pdfsSemRegistro,
    ultimaExecucao: execucoes.at(-1) ?? null,
    avisoLivro,
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
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run api/_lib/painel-sadt.test.ts && npx tsc -p api/tsconfig.json --noEmit`
Expected: PASS, 12 testes; `tsc` sem erros.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/painel-sadt.ts api/_lib/painel-sadt.test.ts
git commit -m "feat(painel): montagem pura do painel SADT a partir de registros, livro e PDFs"
```

---

### Task 3: Endpoint `/api/sadt`

**Files:**
- Modify: `api/_lib/google.ts`
- Create: `api/sadt.ts`

- [ ] **Step 1: Helpers do Drive no fim de `api/_lib/google.ts`**

`listFilesInFolder` (id e nome) e `downloadFileText` já existem, criadas nas correções do modo SADT; não recrie. Acrescente só:

```ts
/** Todas as subpastas com esse nome, da mais antiga para a mais nova (o Drive aceita nomes repetidos). */
export async function findSubfoldersByName(accessToken: string, parentId: string, name: string): Promise<DriveFolder[]> {
  const safe = name.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name,parents)',
    orderBy: 'createdTime',
    pageSize: '20',
  });
  const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao buscar subpastas '${name}': ${response.status}`);
  }
  const data = (await response.json()) as { files: DriveFolder[] };
  return data.files;
}

/** Arquivos de qualquer pasta cujo nome começa com `prefixo` (a busca do Drive é por prefixo de termo). */
export async function findFilesByNamePrefix(
  accessToken: string,
  prefixo: string,
  mimeType: string
): Promise<{ id: string; name: string; webViewLink?: string }[]> {
  const safe = prefixo.replace(/'/g, "\\'");
  const arquivos: { id: string; name: string; webViewLink?: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `name contains '${safe}' and mimeType='${mimeType}' and trashed=false`,
      fields: 'nextPageToken,files(id,name,webViewLink)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Falha ao buscar arquivos '${prefixo}': ${response.status}`);
    }
    const data = (await response.json()) as {
      files: { id: string; name: string; webViewLink?: string }[];
      nextPageToken?: string;
    };
    arquivos.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return arquivos;
}
```

(Escreva com a ferramenta de edição de arquivo: dentro do código, o `replace` tem de ficar com uma barra invertida dupla antes do apóstrofo, como em `findSubfolderByName`, que já existe no arquivo. Copie o escape de lá.)

- [ ] **Step 2: Criar `api/sadt.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession, writeSession } from './_lib/session.js';
import {
  downloadFileText,
  ensureFreshAccessToken,
  findApoloFolder,
  findFilesByNamePrefix,
  findSubfoldersByName,
  listFilesInFolder,
} from './_lib/google.js';
import { mapearComLimite, montarPainel } from './_lib/painel-sadt.js';
import { pastaDoMes } from './_lib/sadt.js';

export const config = { maxDuration: 60 };

const NOME_LIVRO = '_faturamento.json';

/** JSON do Drive; null quando não abre (o painel mostra como registro ilegível). */
async function baixarJson(accessToken: string, arquivo: { id: string; name: string }): Promise<unknown> {
  try {
    return JSON.parse((await downloadFileText(accessToken, arquivo.id)).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const mes = typeof req.query?.mes === 'string' ? req.query.mes : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return res.status(400).json({ error: 'invalid_month', message: 'Mês no formato AAAA-MM.' });
  }

  try {
    const accessToken = await ensureFreshAccessToken(session);
    let apoloFolderId = session.apoloFolderId;
    if (!apoloFolderId) {
      const apolo = await findApoloFolder(accessToken);
      if (!apolo) {
        return res.status(404).json({ error: 'apolo_not_found', message: 'Pasta "Apolo" não encontrada no seu Drive.' });
      }
      apoloFolderId = apolo.id;
      session.apoloFolderId = apoloFolderId;
    }
    writeSession(res, session);
    const apoloId: string = apoloFolderId;

    const raizes = await findSubfoldersByName(accessToken, apoloId, '_SADT');
    const pastasDoMes = (
      await Promise.all(raizes.map((raiz) => findSubfoldersByName(accessToken, raiz.id, pastaDoMes(`${mes}-01`))))
    ).flat();
    const arquivos = (await Promise.all(pastasDoMes.map((p) => listFilesInFolder(accessToken, p.id)))).flat();

    const arquivosDeRegistro = arquivos.filter((a) => /\.json$/i.test(a.name) && !a.name.startsWith('_'));
    const arquivoDoLivro = arquivos.find((a) => a.name === NOME_LIVRO);

    const [registros, livro, pdfs] = await Promise.all([
      mapearComLimite(arquivosDeRegistro, 8, async (a) => ({ nome: a.name, conteudo: await baixarJson(accessToken, a) })),
      arquivoDoLivro ? baixarJson(accessToken, arquivoDoLivro) : Promise.resolve(null),
      findFilesByNamePrefix(accessToken, 'Guia_SADT_', 'application/pdf'),
    ]);

    return res.status(200).json(
      montarPainel({
        mes,
        registros,
        livro,
        pdfs: pdfs.map((p) => ({ id: p.id, nome: p.name, link: p.webViewLink ?? null })),
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[sadt] error:', message);
    return res.status(500).json({ error: 'painel_failed', message });
  }
}
```

(`pastaDoMes` de `api/_lib/sadt.ts` recebe uma data ISO; `${mes}-01` vira `AAAA.MM`. Um livro que existe mas não abre chega como `null`… e por isso o `baixarJson` do livro devolve `null` também quando o JSON quebra: nesse caso o painel mostra "falta faturar", e o robô, que lê o mesmo arquivo, para com erro claro.)

- [ ] **Step 3: Typecheck e testes**

Run: `npx tsc -p api/tsconfig.json --noEmit && npx vitest run`
Expected: sem erros; Vitest PASS.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/google.ts api/sadt.ts
git commit -m "feat(painel): endpoint /api/sadt lê registros, livro e PDFs do mês"
```

---

### Task 4: Cliente do painel (`src/lib/painel.ts`)

**Files:**
- Create: `src/lib/painel.ts`
- Test: `src/lib/painel.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/painel.test.ts
import { describe, expect, it } from 'vitest';
import { comandoRobo, deslocarMes, diaDaSemana, diasDoMes, formatarMoeda, guiasPorDia, mesAnterior, rotuloMes, type GuiaPainel } from './painel';

function guia(data: string | null, status: GuiaPainel['status'] = 'faturada'): GuiaPainel {
  return { chave: `${data}.json`, paciente: 'X', data, status, guiaPortal: null, valor: null, motivo: null, pdfId: null, digitalizadoPor: null };
}

describe('meses', () => {
  it('mês anterior, inclusive na virada do ano', () => {
    expect(mesAnterior(new Date(2026, 9, 1))).toBe('2026-09');
    expect(mesAnterior(new Date(2026, 0, 15))).toBe('2025-12');
  });
  it('desloca para frente e para trás', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2026-09', 0)).toBe('2026-09');
  });
  it('rótulo em português', () => {
    expect(rotuloMes('2026-09')).toBe('setembro de 2026');
    expect(rotuloMes('2027-03')).toBe('março de 2027');
  });
  it('dias do mês, com fevereiro bissexto', () => {
    expect(diasDoMes('2026-09')).toBe(30);
    expect(diasDoMes('2026-02')).toBe(28);
    expect(diasDoMes('2028-02')).toBe(29);
  });
  it('dia da semana (0 = domingo)', () => {
    expect(diaDaSemana('2026-09', 27)).toBe(0);
    expect(diaDaSemana('2026-10', 1)).toBe(4);
  });
});

describe('comandoRobo', () => {
  it('ensaio e de verdade', () => {
    expect(comandoRobo('2026-09', true)).toBe('npm run faturar-sadt -- 2026-09 --dry-run');
    expect(comandoRobo('2026-09', false)).toBe('npm run faturar-sadt -- 2026-09');
  });
});

describe('guiasPorDia', () => {
  it('agrupa pelo dia do mês e ignora guia sem data', () => {
    const porDia = guiasPorDia([guia('2026-09-01'), guia('2026-09-01', 'pendencia'), guia('2026-09-30'), guia(null)]);
    expect(porDia.get(1)?.map((g) => g.status)).toEqual(['faturada', 'pendencia']);
    expect(porDia.get(30)).toHaveLength(1);
    expect(porDia.size).toBe(2);
  });
});

describe('formatarMoeda', () => {
  it('real com vírgula e milhar', () => {
    expect(formatarMoeda(1476.36)).toMatch(/^R\$\s1\.476,36$/);
  });
});
```

Run: `npx vitest run src/lib/painel.test.ts`
Expected: FAIL — `./painel` não existe.

- [ ] **Step 2: Implementar `src/lib/painel.ts`**

```ts
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
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/lib/painel.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/painel.ts src/lib/painel.test.ts
git commit -m "feat(painel): cliente do painel com datas de mês e comando do robô"
```

---

### Task 5: A tela do painel

**Files:**
- Create: `src/components/PainelSadtScreen.tsx`
- Modify: `src/App.tsx`, `src/dev/Demo.tsx`

- [ ] **Step 1: Criar `src/components/PainelSadtScreen.tsx`**

```tsx
// src/components/PainelSadtScreen.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from './Logo';
import { ApiError } from '../lib/api';
import { guardarDestino } from '../lib/destino';
import {
  buscarPainel,
  comandoRobo,
  deslocarMes,
  diaDaSemana,
  diasDoMes,
  formatarMoeda,
  guiasPorDia,
  mesAnterior,
  rotuloMes,
  type GuiaPainel,
  type PainelSadt,
  type StatusPainel,
} from '../lib/painel';
import { isoParaDataBr } from '../lib/sadt';

type Estado =
  | { kind: 'carregando' }
  | { kind: 'pronto'; painel: PainelSadt }
  | { kind: 'erro'; mensagem: string; sessao: boolean };

/** Ordem de leitura: primeiro o que pede ação humana, por último o que já está resolvido. */
const ORDEM: StatusPainel[] = ['conferir', 'pendencia', 'registro_ilegivel', 'falta_faturar', 'duplicada', 'faturada'];

const ESTILO: Record<StatusPainel, { rotulo: string; ponto: string; texto: string; explica: string }> = {
  conferir: {
    rotulo: 'Conferir no portal',
    ponto: 'bg-amber',
    texto: 'text-amber-600',
    explica: 'A guia existe no portal mas o robô não viu a finalização. Confira antes de rodar de novo.',
  },
  pendencia: {
    rotulo: 'Pendências',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'O robô parou nestas sem salvar nada. O motivo está em cada linha.',
  },
  registro_ilegivel: {
    rotulo: 'Registro ilegível',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'O arquivo do registro não abriu. Digitalize a guia de novo ou avise o Daniel.',
  },
  falta_faturar: {
    rotulo: 'Falta faturar',
    ponto: 'bg-navy',
    texto: 'text-navy',
    explica: 'Digitalizadas e ainda não passaram pelo robô.',
  },
  duplicada: {
    rotulo: 'Duplicadas',
    ponto: 'bg-cyan',
    texto: 'text-cyan-600',
    explica: 'Mesma senha de outra guia do mês. Só uma é faturada.',
  },
  faturada: {
    rotulo: 'Faturadas',
    ponto: 'bg-success',
    texto: 'text-success',
    explica: 'Finalizadas no portal MedSênior.',
  },
};

type Props = {
  /** Injetável para a vitrine de desenvolvimento. */
  carregar?: (mes: string) => Promise<PainelSadt>;
  mesInicial?: string;
};

export function PainelSadtScreen({ carregar = buscarPainel, mesInicial }: Props) {
  const [mes, setMes] = useState(() => mesInicial ?? mesAnterior(new Date()));
  const [estado, setEstado] = useState<Estado>({ kind: 'carregando' });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    carregar(mes).then(
      (painel) => {
        if (!cancelado) setEstado({ kind: 'pronto', painel });
      },
      (erro: unknown) => {
        if (cancelado) return;
        const sessao = erro instanceof ApiError && erro.status === 401;
        const mensagem =
          erro instanceof ApiError ? erro.body.message || erro.body.error : erro instanceof Error ? erro.message : 'Erro ao carregar.';
        setEstado({ kind: 'erro', mensagem, sessao });
      }
    );
    return () => {
      cancelado = true;
    };
  }, [mes, versao, carregar]);

  const irPara = (novo: string) => {
    setEstado({ kind: 'carregando' });
    setMes(novo);
  };
  const recarregar = () => {
    setEstado({ kind: 'carregando' });
    setVersao((v) => v + 1);
  };

  return (
    <div className="min-h-[100svh] bg-bone pb-20">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <a
          href="https://femme-vita-hub.vercel.app/master"
          className="font-mono text-[11px] tracking-wider uppercase text-navy/60 transition hover:text-navy"
        >
          ← Hub
        </a>
        <Logo variant="dark" size="sm" />
      </header>

      <main className="mx-auto max-w-3xl px-5">
        <p className="mt-8 font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">
          Faturamento SADT · MedSênior
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-4xl italic leading-[0.95] text-navy first-letter:uppercase sm:text-6xl">
            {rotuloMes(mes)}
          </h1>
          <div className="flex shrink-0 gap-2 pb-1">
            <BotaoMes rotulo="Mês anterior" onClick={() => irPara(deslocarMes(mes, -1))}>‹</BotaoMes>
            <BotaoMes rotulo="Próximo mês" onClick={() => irPara(deslocarMes(mes, 1))}>›</BotaoMes>
          </div>
        </div>

        {estado.kind === 'carregando' && <Carregando />}
        {estado.kind === 'erro' && <Erro mensagem={estado.mensagem} sessao={estado.sessao} onTentar={recarregar} />}
        {estado.kind === 'pronto' && <Conteudo painel={estado.painel} onRecarregar={recarregar} />}
      </main>
    </div>
  );
}

function BotaoMes({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      className="grid h-11 w-11 place-items-center rounded-full border border-navy/15 bg-bone-50 font-serif text-2xl leading-none text-navy shadow-soft transition hover:border-navy/40 active:scale-95"
    >
      {children}
    </button>
  );
}

function Conteudo({ painel, onRecarregar }: { painel: PainelSadt; onRecarregar: () => void }) {
  const { totais } = painel;
  const vazio = painel.guias.length === 0 && painel.pdfsSemRegistro.length === 0;

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy/10 bg-navy/10 shadow-soft sm:grid-cols-4 animate-slide-in">
        <Total rotulo="Digitalizadas" valor={totais.digitalizadas} />
        <Total rotulo="Faturadas" valor={totais.faturadas} extra={formatarMoeda(totais.valorFaturado)} tom="text-success" />
        <Total rotulo="Falta faturar" valor={totais.faltaFaturar} />
        <Total rotulo="Pedem atenção" valor={totais.atencao} tom={totais.atencao > 0 ? 'text-danger' : undefined} />
      </dl>

      {!vazio && <Regua mes={painel.mes} guias={painel.guias} />}

      {painel.avisoLivro && (
        <p className="mt-6 rounded-2xl border border-danger/30 bg-danger/8 p-4 font-serif text-base italic leading-snug text-navy">
          {painel.avisoLivro}
        </p>
      )}

      {vazio && (
        <p className="mt-12 text-center font-serif text-2xl italic text-navy/50">
          Nenhuma guia SADT digitalizada em {rotuloMes(painel.mes)}.
        </p>
      )}

      {painel.pdfsSemRegistro.length > 0 && (
        <section className="mt-10 animate-slide-in">
          <CabecalhoSecao ponto="bg-danger" texto="text-danger" rotulo="PDF sem registro" quantidade={painel.pdfsSemRegistro.length}>
            O PDF está na pasta da paciente, mas o registro do faturamento não foi gravado. O robô não vê esta guia.
          </CabecalhoSecao>
          <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
            {painel.pdfsSemRegistro.map((pdf) => (
              <li key={pdf.id} className="flex items-baseline justify-between gap-3 border-t border-navy/8 py-3 first:border-t-0">
                <span className="min-w-0 truncate font-mono text-[12px] text-navy">{pdf.nome}</span>
                {pdf.link && <LinkPdf href={pdf.link} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ORDEM.map((status, i) => {
        const guias = painel.guias.filter((g) => g.status === status);
        if (guias.length === 0) return null;
        const estilo = ESTILO[status];
        return (
          <section key={status} className="mt-10 animate-slide-in" style={{ animationDelay: `${80 * (i + 1)}ms` }}>
            <CabecalhoSecao ponto={estilo.ponto} texto={estilo.texto} rotulo={estilo.rotulo} quantidade={guias.length}>
              {estilo.explica}
            </CabecalhoSecao>
            <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
              {guias.map((guia) => (
                <LinhaGuia key={guia.chave} guia={guia} />
              ))}
            </ul>
          </section>
        );
      })}

      <Robo painel={painel} onRecarregar={onRecarregar} />
    </>
  );
}

function Total({ rotulo, valor, extra, tom }: { rotulo: string; valor: number; extra?: string; tom?: string }) {
  return (
    <div className="bg-bone-50 p-4">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy/45">{rotulo}</dt>
      <dd className={`mt-1 font-mono text-3xl tabular-nums leading-none ${tom ?? 'text-navy'}`}>{valor}</dd>
      {extra && <dd className="mt-1.5 font-mono text-[11px] tabular-nums text-navy/50">{extra}</dd>}
    </div>
  );
}

/** Um ponto por guia, no dia da consulta. Mês inteiro verde = mês faturado. */
function Regua({ mes, guias }: { mes: string; guias: GuiaPainel[] }) {
  const dias = diasDoMes(mes);
  const porDia = guiasPorDia(guias);
  return (
    <figure className="mt-6 rounded-2xl border border-navy/8 bg-bone-50 p-4 shadow-soft animate-slide-in" style={{ animationDelay: '60ms' }}>
      <figcaption className="sr-only">Guias por dia da consulta</figcaption>
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-y-4 sm:grid-cols-[repeat(31,minmax(0,1fr))]">
        {Array.from({ length: dias }, (_, i) => {
          const dia = i + 1;
          const doDia = (porDia.get(dia) ?? []).slice().sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status));
          const domingo = diaDaSemana(mes, dia) === 0;
          return (
            <div key={dia} className="flex flex-col items-center gap-1.5" title={`${dia}: ${doDia.length} guia(s)`}>
              <div className="flex h-12 flex-col-reverse items-center gap-1">
                {doDia.slice(0, 4).map((g) => (
                  <span key={g.chave} className={`h-2 w-2 rounded-full ${ESTILO[g.status].ponto}`} />
                ))}
                {doDia.length > 4 && <span className="font-mono text-[8px] leading-none text-navy/50">+{doDia.length - 4}</span>}
              </div>
              <span className={`font-mono text-[9px] tabular-nums ${domingo ? 'text-navy/25' : 'text-navy/50'}`}>{dia}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function CabecalhoSecao({
  ponto,
  texto,
  rotulo,
  quantidade,
  children,
}: {
  ponto: string;
  texto: string;
  rotulo: string;
  quantidade: number;
  children: ReactNode;
}) {
  return (
    <header>
      <h2 className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] uppercase ${texto}`}>
        <span className={`h-2 w-2 rounded-full ${ponto}`} />
        {rotulo}
        <span className="text-navy/40">· {quantidade}</span>
      </h2>
      <p className="mt-1 font-serif text-[15px] italic leading-snug text-navy/60">{children}</p>
    </header>
  );
}

function detalheDaGuia(guia: GuiaPainel): string {
  if (guia.status === 'faturada') {
    return [guia.guiaPortal && `guia ${guia.guiaPortal}`, guia.valor !== null && formatarMoeda(guia.valor)]
      .filter(Boolean)
      .join(' · ');
  }
  if (guia.status === 'falta_faturar') {
    return guia.digitalizadoPor ? `digitalizada por ${guia.digitalizadoPor}` : 'digitalizada';
  }
  const prefixo = guia.guiaPortal ? `guia ${guia.guiaPortal} · ` : '';
  return `${prefixo}${guia.motivo ?? ''}`;
}

function LinhaGuia({ guia }: { guia: GuiaPainel }) {
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
      <span className="font-mono text-[12px] tabular-nums text-navy/50">
        {guia.data ? isoParaDataBr(guia.data).slice(0, 5) : '—'}
      </span>
      <div className="min-w-0">
        <p className="truncate font-serif text-lg leading-snug text-navy">{guia.paciente}</p>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaGuia(guia)}</p>
      </div>
      {guia.pdfId ? <LinkPdf href={`https://drive.google.com/file/d/${guia.pdfId}/view`} /> : <span />}
    </li>
  );
}

function LinkPdf({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 font-mono text-[10px] tracking-wider uppercase text-cyan-600 underline decoration-cyan-600/30 underline-offset-4"
    >
      PDF ↗
    </a>
  );
}

function Robo({ painel, onRecarregar }: { painel: PainelSadt; onRecarregar: () => void }) {
  const ultima = painel.ultimaExecucao;
  return (
    <section className="mt-12 overflow-hidden rounded-2xl bg-navy-deep text-bone shadow-lifted">
      <div className="border-b border-bone/10 px-5 py-5">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-amber">Robô</p>
        <p className="mt-1 font-serif text-2xl italic leading-tight">Faturar no computador do Daniel</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone/60">
          Na pasta <span className="font-mono text-bone/80">femme-vita-faturamento</span>, rode primeiro o ensaio: ele
          preenche e confere cada guia sem salvar. Se tudo vier ok, rode o de verdade.
        </p>
      </div>
      <Comando rotulo="Ensaio" texto={comandoRobo(painel.mes, true)} />
      <Comando rotulo="Faturar" texto={comandoRobo(painel.mes, false)} />
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-bone/50">
          {ultima
            ? `Última execução${ultima.dryRun ? ' (ensaio)' : ''}: ${new Date(ultima.inicio).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })} · ${ultima.resumo}`
            : 'O robô ainda não rodou neste mês.'}
        </p>
        <button
          onClick={onRecarregar}
          className="shrink-0 rounded-full border border-bone/20 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone/80 transition hover:border-bone/50 active:scale-95"
        >
          Atualizar
        </button>
      </div>
    </section>
  );
}

function Comando({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="flex items-center gap-3 border-b border-bone/10 px-5 py-3">
      <span className="w-14 shrink-0 font-mono text-[10px] tracking-wider uppercase text-bone/40">{rotulo}</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-bone">
        <span className="text-amber">$ </span>
        {texto}
      </code>
      <button
        onClick={copiar}
        className="shrink-0 rounded-full bg-bone/10 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone transition hover:bg-bone/20 active:scale-95"
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Carregando o mês">
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-40 animate-pulse rounded-2xl bg-navy/5" />
    </div>
  );
}

function Erro({ mensagem, sessao, onTentar }: { mensagem: string; sessao: boolean; onTentar: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-danger/30 bg-danger/8 p-5">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">
        {sessao ? 'Sessão expirada' : 'Não carregou'}
      </p>
      <p className="mt-1.5 font-serif text-lg italic leading-snug text-navy">{mensagem}</p>
      {sessao ? (
        <a
          href="/api/auth/google"
          onClick={() => guardarDestino(window.location.search)}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-navy px-4 font-mono text-[11px] tracking-wider uppercase text-bone"
        >
          Entrar de novo
        </a>
      ) : (
        <button
          onClick={onTentar}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-navy px-4 font-mono text-[11px] tracking-wider uppercase text-bone"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rota em `src/App.tsx`**

2a. Acrescentar o import `import { PainelSadtScreen } from './components/PainelSadtScreen';`.

2b. Logo depois do `useMemo` que define `modo`, acrescentar:

```tsx
  // ?tela=faturamento-sadt vem do card "Faturamento SADT" do Hub (Master).
  const tela = useMemo(() => new URLSearchParams(window.location.search).get('tela'), []);
```

2c. Logo depois de `if (auth.kind === 'unauthenticated') return <LoginScreen error={auth.error} />;`, acrescentar:

```tsx
  if (tela === 'faturamento-sadt') return <PainelSadtScreen />;
```

- [ ] **Step 3: Vitrine em `src/dev/Demo.tsx`**

Acrescentar o import `import { PainelSadtScreen } from '../components/PainelSadtScreen';` e `import type { PainelSadt } from '../lib/painel';`, a constante abaixo antes de `export default`, e os dois `case` antes do `default`:

```tsx
const PAINEL: PainelSadt = {
  mes: '2026-09',
  guias: [
    { chave: 'a.json', paciente: 'MARIA DE TESTE LIMA', data: '2026-09-02', status: 'faturada', guiaPortal: '3320311', valor: 82.02, motivo: null, pdfId: 'p1', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'b.json', paciente: 'Ana Exemplo Souza', data: '2026-09-02', status: 'faturada', guiaPortal: '3320312', valor: 82.02, motivo: null, pdfId: 'p2', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'c.json', paciente: 'Beatriz Modelo Costa', data: '2026-09-09', status: 'pendencia', guiaPortal: null, valor: null, motivo: 'Trava 1: o portal carregou "BEATRIZ OUTRA", a guia diz "BEATRIZ MODELO COSTA"', pdfId: 'p3', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'd.json', paciente: 'Carla Demonstração Reis', data: '2026-09-15', status: 'falta_faturar', guiaPortal: null, valor: null, motivo: null, pdfId: 'p4', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'e.json', paciente: 'Diana Fictícia Lopes', data: '2026-09-21', status: 'conferir', guiaPortal: '3320330', valor: 82.02, motivo: 'guia 3320330 ficou sem confirmação de finalização; confira no portal antes de rodar de novo', pdfId: 'p5', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'f.json', paciente: 'Elisa Amostra Prado', data: '2026-09-30', status: 'duplicada', guiaPortal: null, valor: null, motivo: 'mesma senha de a.json', pdfId: 'p6', digitalizadoPor: 'recepcao@exemplo.com' },
  ],
  pdfsSemRegistro: [{ id: 'p9', nome: 'Guia_SADT_Fabiana Teste_2026.09.18.pdf', link: 'https://drive.google.com' }],
  ultimaExecucao: { inicio: '2026-10-03T13:00:00.000Z', fim: '2026-10-03T13:06:00.000Z', dryRun: false, resumo: '2 faturadas, 1 pendência, 1 para conferir no portal' },
  avisoLivro: null,
  totais: { digitalizadas: 6, faturadas: 2, valorFaturado: 164.04, faltaFaturar: 1, atencao: 3, duplicadas: 1 },
};
```

```tsx
    case 'painel-sadt':
      return <PainelSadtScreen mesInicial="2026-09" carregar={async () => PAINEL} />;
    case 'painel-sadt-vazio':
      return (
        <PainelSadtScreen
          mesInicial="2026-08"
          carregar={async (mes) => ({ ...PAINEL, mes, guias: [], pdfsSemRegistro: [], ultimaExecucao: null, totais: { digitalizadas: 0, faturadas: 0, valorFaturado: 0, faltaFaturar: 0, atencao: 0, duplicadas: 0 } })}
        />
      );
```

E acrescentar `painel-sadt, painel-sadt-vazio` à lista do `default`.

- [ ] **Step 4: Typecheck, lint, testes e build**

Run: `npx tsc -b && npx eslint src && npx vitest run && npx vite build`
Expected: tudo verde.

- [ ] **Step 5: Conferir no navegador**

Com `preview_start {name: "arquivo"}`:
- `http://localhost:5181/?demo=painel-sadt` em desktop (1280 px) e em celular (375 px): título "Setembro de 2026", quatro totais, régua com pontos nos dias 2, 9, 15, 18 não (PDF sem registro não tem ponto), 21 e 30, seção "PDF sem registro", seções na ordem Conferir, Pendências, Falta faturar, Duplicadas, Faturadas, e o cartão escuro do robô. Sem rolagem horizontal da página em 375 px (o comando pode rolar dentro do próprio bloco). Botão "Copiar" muda para "Copiado".
- `?demo=painel-sadt-vazio`: "Nenhuma guia SADT digitalizada em agosto de 2026." e o cartão do robô com "O robô ainda não rodou neste mês."
- Botões ‹ › trocam o mês e mostram o carregamento.
- Console sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/PainelSadtScreen.tsx src/App.tsx src/dev/Demo.tsx
git commit -m "feat(painel): tela do faturamento SADT com régua do mês e comando do robô"
```

---

### Task 6: Card "Faturamento SADT" no Hub

**Files:**
- Modify: `C:\Users\User\Developer\femme-vita-hub\config\portais.json`

- [ ] **Step 1: Acrescentar o card logo depois do card `faturamento-medsenior`**

```json
    {
      "id": "faturamento-sadt",
      "nome": "Faturamento SADT",
      "descricao": "O mês das guias SADT da MedSênior: o que o robô já faturou, o que falta e as pendências.",
      "grupo": "gestao",
      "acesso": "master",
      "tipo": "app",
      "url": "https://femme-vita-app.vercel.app/?tela=faturamento-sadt",
      "abrir": "nova-aba",
      "estado": "no-ar",
      "icone": "recibo",
      "login": "conta Google",
      "para": "Daniel e Priscila"
    },
```

- [ ] **Step 2: Testes do Hub**

Run: `npm test` (na pasta do Hub)
Expected: PASS. O card é Master, então a lista da versão da equipe não muda.

- [ ] **Step 3: Commit**

```bash
git add config/portais.json
git commit -m "feat: card Faturamento SADT na versão Master"
```

A publicação do Arquivo e do Hub é a Task 12 do plano do modo SADT.
