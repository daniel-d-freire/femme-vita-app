# Painel "Anexos MedSênior" no Arquivo + card no Hub: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a tela `?tela=anexos` no Arquivo e o card "Anexos MedSênior" na versão Master do Hub. A tela lê, pelo Drive, o registro do mês que o robô `anexar-contas` grava e mostra conta a conta:
- o que já foi anexado;
- as pendências e o motivo de cada uma;
- o que precisa ser conferido no portal;
- o comando para rodar o robô.

**Spec:** `C:\Users\User\Developer\femme-vita-faturamento\docs\superpowers\specs\2026-10-04-anexar-contas-design.md`, seções 6 (formato do registro), 9 (painel) e 10 (card).

**Architecture:** segue o painel SADT que já existe (`api/sadt.ts`, `api/_lib/painel-sadt.ts`, `src/lib/painel.ts`, `src/components/PainelSadtScreen.tsx`).
- A API só localiza e baixa `Apolo/_ANEXOS/<AAAA.MM>/_anexos.json`.
- Uma função pura monta o painel.
- A tela reaproveita as peças visuais do painel SADT. Elas saem para um arquivo compartilhado, sem mudar o comportamento.
- O card do Hub é uma entrada nova em `config/portais.json`.

**Tech Stack:** Vercel Functions (`@vercel/node`), React 19, Tailwind 4, zod 4 e vitest, no repo `femme-vita-app`. Vite, React e vitest no repo `femme-vita-hub`.

**Rules:**
- Trabalhe na `main` de cada repo.
- Commit a cada task. **Não faça push**: o push publica em produção e é decidido na Task 7, com o Daniel.
- Nenhum dado real de paciente em teste ou fixture.
- Textos da tela em português, no tom do painel SADT.

---

## Mapa de arquivos

| Repo | Arquivo | Responsabilidade |
|---|---|---|
| app | `api/_lib/painel-anexos.ts` | `montarPainelAnexos` (pura): valida o registro e monta contas, totais e avisos |
| app | `api/anexos.ts` | GET `/api/anexos?mes=AAAA-MM`: sessão, pasta Apolo, `_ANEXOS/<AAAA.MM>/_anexos.json` |
| app | `src/components/painel-parts.tsx` | peças visuais comuns aos dois painéis, movidas do `PainelSadtScreen` |
| app | `src/lib/anexos.ts` | tipos espelhados, `buscarPainelAnexos`, comandos do robô, textos por conta |
| app | `src/components/PainelAnexosScreen.tsx` | a tela |
| app | `src/App.tsx` | rota `?tela=anexos` |
| app | `src/dev/Demo.tsx` | vitrine com dados fictícios (`?demo=painel-anexos`) |
| hub | `config/portais.json` | card `anexos-medsenior` |

---

### Task 1: Montagem do painel (função pura)

**Files:**
- Create: `api/_lib/painel-anexos.ts`
- Test: `api/_lib/painel-anexos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// api/_lib/painel-anexos.test.ts
import { describe, expect, it } from 'vitest';
import { montarPainelAnexos, pastaDoMesAnexos, referenciaDoMes } from './painel-anexos.js';

function entrada(status: string, extra: Record<string, unknown> = {}) {
  return { status, nr: '140000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', tipoAnexo: '1', arquivos: ['a.pdf'], motivo: null, em: '2026-11-05T12:00:00.000Z', ...extra };
}
function registro(contas: Record<string, unknown>, execucoes: unknown[] = []) {
  return { versao: 1, referencia: '11/2026', execucoes, contas };
}

describe('referência e pasta', () => {
  it('converte o mês do painel', () => {
    expect(referenciaDoMes('2026-11')).toBe('11/2026');
    expect(pastaDoMesAnexos('2026-11')).toBe('2026.11');
  });
});

describe('montarPainelAnexos', () => {
  it('sem registro: painel vazio, sem aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-11', registros: [] });
    expect(p).toMatchObject({ referencia: '11/2026', contas: [], aviso: null, ultimaExecucao: null });
    expect(p.totais.total).toBe(0);
  });

  it('enviando vira conferir; ordena conferir, pendência, não enviada, anexada', () => {
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [
        registro({
          '1': entrada('anexada', { paciente: 'ANA' }),
          '2': entrada('nao_enviada', { paciente: 'BIA' }),
          '3': entrada('pendencia', { paciente: 'CIDA', motivo: 'falta guia de honorários assinada', tipo: 'honorarios' }),
          '4': entrada('enviando', { paciente: 'DORA' }),
        }),
      ],
    });
    expect(p.contas.map((c) => [c.conta, c.status])).toEqual([
      ['4', 'conferir'],
      ['3', 'pendencia'],
      ['2', 'nao_enviada'],
      ['1', 'anexada'],
    ]);
    expect(p.totais).toEqual({ total: 4, anexadas: 1, pendencias: 1, conferir: 1, naoEnviadas: 1 });
    expect(p.contas[1]).toMatchObject({ tipo: 'honorarios', motivo: 'falta guia de honorários assinada' });
  });

  it('última execução é a última da lista; nota é mantida', () => {
    const exec = (resumo: string) => ({ inicio: 'i', fim: 'f', dryRun: false, resumo });
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [registro({ '1': entrada('anexada', { nota: 'anexada à mão' }) }, [exec('a'), exec('b')])],
    });
    expect(p.ultimaExecucao?.resumo).toBe('b');
    expect(p.contas[0]?.nota).toBe('anexada à mão');
  });

  it('registro que não abre ou fora do formato vira aviso', () => {
    expect(montarPainelAnexos({ mes: '2026-11', registros: [null] }).aviso).toMatch(/não abriu ou está fora do formato/);
    expect(montarPainelAnexos({ mes: '2026-11', registros: [{ versao: 1 }] }).aviso).toMatch(/fora do formato/);
  });

  it('registro de outra Referência vira aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-12', registros: [registro({})] });
    expect(p.aviso).toBe('O registro desta pasta é da Referência 11/2026, não de 12/2026.');
  });

  it('mais de um registro (pasta duplicada no Drive) vira aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-11', registros: [registro({}), registro({})] });
    expect(p.aviso).toMatch(/mais de um _anexos\.json/);
    expect(p.contas).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run api/_lib/painel-anexos.test.ts`
Expected: FAIL. O módulo `./painel-anexos.js` não existe.

- [ ] **Step 3: Implementar**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run api/_lib/painel-anexos.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/painel-anexos.ts api/_lib/painel-anexos.test.ts
git commit -m "feat(anexos): montagem do painel a partir do registro do robô"
```

---

### Task 2: API `/api/anexos`

**Files:**
- Create: `api/anexos.ts`

Segue `api/sadt.ts`: leia esse arquivo antes, para copiar o padrão de sessão, da pasta Apolo e dos erros. A lógica fica na função pura da Task 1, por isso esta task não tem teste unitário.

- [ ] **Step 1: Implementar**

```ts
// api/anexos.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession, writeSession } from './_lib/session.js';
import { downloadFileText, ensureFreshAccessToken, findApoloFolder, findSubfoldersByName, listFilesInFolder } from './_lib/google.js';
import { montarPainelAnexos, pastaDoMesAnexos } from './_lib/painel-anexos.js';

export const config = { maxDuration: 30 };

const NOME_REGISTRO = '_anexos.json';

/** JSON do Drive; null quando não abre (o painel mostra o aviso de registro ilegível). */
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

    const raizes = await findSubfoldersByName(accessToken, apoloId, '_ANEXOS');
    const pastas = (await Promise.all(raizes.map((r) => findSubfoldersByName(accessToken, r.id, pastaDoMesAnexos(mes))))).flat();
    const arquivos = (await Promise.all(pastas.map((p) => listFilesInFolder(accessToken, p.id)))).flat();
    const registros = await Promise.all(arquivos.filter((a) => a.name === NOME_REGISTRO).map((a) => baixarJson(accessToken, a)));

    return res.status(200).json(montarPainelAnexos({ mes, registros }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'token_expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('[anexos] error:', message);
    return res.status(500).json({ error: 'painel_failed', message });
  }
}
```

- [ ] **Step 2: Conferir os tipos e os testes**

Run: `npx tsc -b && npx vitest run api`
Expected: o build de tipos passa sem erros e os testes de `api/` passam.

- [ ] **Step 3: Commit**

```bash
git add api/anexos.ts
git commit -m "feat(anexos): GET /api/anexos lê o registro do mês no Drive"
```

---

### Task 3: Peças visuais compartilhadas (sem mudar comportamento)

**Files:**
- Create: `src/components/painel-parts.tsx`
- Modify: `src/components/PainelSadtScreen.tsx`

Seis componentes saem **sem alteração** de `PainelSadtScreen.tsx` para `painel-parts.tsx`, onde passam a ser exportados: `BotaoMes`, `Total`, `CabecalhoSecao`, `Comando`, `Carregando` e `Erro`.

- [ ] **Step 1: Mover**

1. Recorte as seis funções de `PainelSadtScreen.tsx` exatamente como estão e cole-as em `src/components/painel-parts.tsx`, com `export` na frente de cada uma.
2. Mova junto os imports que elas usam:
   - `useState` e `type ReactNode` de `react`;
   - `guardarDestino` de `../lib/destino`.
3. Comece o arquivo com o comentário `// src/components/painel-parts.tsx — peças comuns aos painéis (SADT, Anexos)`.
4. Em `PainelSadtScreen.tsx`, importe as seis de `./painel-parts`. Remova os imports que ficaram sem uso (`guardarDestino` e, se não for mais usado, `useState`).

- [ ] **Step 2: Conferir que nada mudou**

Run: `npx tsc -b && npx vitest run && npx eslint src/components`
Expected: tudo passa.

Depois, abra a vitrine com o servidor de desenvolvimento (entrada `arquivo` do `.claude/launch.json`, porta 5181): `http://localhost:5181/?demo=painel-sadt` e `?demo=painel-sadt-vazio`. A tela tem de ficar idêntica à de antes. Confira o placar, as seções, o bloco "Robô" com o botão Copiar e o estado vazio.

- [ ] **Step 3: Commit**

```bash
git add src/components/painel-parts.tsx src/components/PainelSadtScreen.tsx
git commit -m "refactor(painel): peças visuais comuns em painel-parts"
```

---

### Task 4: Cliente e textos do painel

**Files:**
- Create: `src/lib/anexos.ts`
- Test: `src/lib/anexos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/anexos.test.ts
import { describe, expect, it } from 'vitest';
import { comandoAnexos, comandoReenvio, detalheDaConta, mesAtual, rotuloTipo, type ContaPainel } from './anexos';

const conta = (extra: Partial<ContaPainel> = {}): ContaPainel => ({
  conta: '12345678', nr: '140000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', status: 'anexada',
  arquivos: ['Guia_SADT_MARIA DE TESTE LIMA_2026.10.01.pdf'], motivo: null, em: '2026-11-05T12:00:00.000Z', nota: null, ...extra,
});

describe('mês e comandos', () => {
  it('mês atual no formato AAAA-MM', () => {
    expect(mesAtual(new Date(2026, 9, 4))).toBe('2026-10');
  });
  it('comandos do robô com a Referência MM/AAAA', () => {
    expect(comandoAnexos('2026-11', true)).toBe('npm run anexar-contas -- 11/2026 --dry-run');
    expect(comandoAnexos('2026-11', false)).toBe('npm run anexar-contas -- 11/2026');
    expect(comandoReenvio('2026-11', '12345678')).toBe('npm run anexar-contas -- 11/2026 --conta 12345678 --reenviar 12345678');
  });
});

describe('textos', () => {
  it('rótulo do tipo', () => {
    expect(rotuloTipo('sadt')).toBe('SADT');
    expect(rotuloTipo('honorarios')).toBe('Honorários');
    expect(rotuloTipo('desconhecido')).toBe('Tipo não previsto');
  });
  it('detalhe por status', () => {
    expect(detalheDaConta(conta())).toBe('Conta 12345678 · SADT · Guia_SADT_MARIA DE TESTE LIMA_2026.10.01.pdf');
    expect(detalheDaConta(conta({ status: 'pendencia', motivo: 'sem guia SADT digitalizada' }))).toBe('Conta 12345678 · SADT · sem guia SADT digitalizada');
    expect(detalheDaConta(conta({ status: 'nao_enviada', arquivos: [] }))).toBe('Conta 12345678 · SADT · ainda não passou pelo robô');
    expect(detalheDaConta(conta({ status: 'conferir', arquivos: ['a.pdf', 'b.pdf'] }))).toBe('Conta 12345678 · SADT · a.pdf · b.pdf');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/anexos.test.ts`
Expected: FAIL. O módulo não existe.

- [ ] **Step 3: Implementar**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/anexos.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/anexos.ts src/lib/anexos.test.ts
git commit -m "feat(anexos): cliente e textos do painel"
```

---

### Task 5: A tela, a rota e a vitrine

**Files:**
- Create: `src/components/PainelAnexosScreen.tsx`
- Modify: `src/App.tsx` (rota)
- Modify: `src/dev/Demo.tsx` (vitrine)

- [ ] **Step 1: Criar a tela**

```tsx
// src/components/PainelAnexosScreen.tsx
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { BotaoMes, Carregando, CabecalhoSecao, Comando, Erro, Total } from './painel-parts';
import { ApiError } from '../lib/api';
import {
  buscarPainelAnexos,
  comandoAnexos,
  comandoReenvio,
  detalheDaConta,
  mesAtual,
  type ContaPainel,
  type PainelAnexos,
  type StatusConta,
} from '../lib/anexos';
import { deslocarMes, rotuloMes } from '../lib/painel';

type Estado =
  | { kind: 'carregando' }
  | { kind: 'pronto'; painel: PainelAnexos }
  | { kind: 'erro'; mensagem: string; sessao: boolean };

/** Primeiro o que pede ação humana; por último o que já está resolvido. */
const ORDEM: StatusConta[] = ['conferir', 'pendencia', 'nao_enviada', 'anexada'];

const ESTILO: Record<StatusConta, { rotulo: string; ponto: string; texto: string; explica: string }> = {
  conferir: {
    rotulo: 'Conferir no portal',
    ponto: 'bg-amber',
    texto: 'text-amber-600',
    explica: 'O robô clicou em Processar e não viu a confirmação. Confira no portal se o anexo está lá; só reenvie se NÃO estiver.',
  },
  pendencia: {
    rotulo: 'Pendências',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'Nada foi enviado. Resolva o motivo (digitalizar, renomear, conferir a pasta) e rode o robô de novo.',
  },
  nao_enviada: {
    rotulo: 'Ainda não enviadas',
    ponto: 'bg-navy',
    texto: 'text-navy',
    explica: 'O robô viu estas contas no portal e ainda não mexeu nelas.',
  },
  anexada: {
    rotulo: 'Anexadas',
    ponto: 'bg-success',
    texto: 'text-success',
    explica: 'O portal confirmou o anexo.',
  },
};

type Props = {
  /** Injetável para a vitrine de desenvolvimento. */
  carregar?: (mes: string) => Promise<PainelAnexos>;
  mesInicial?: string;
};

export function PainelAnexosScreen({ carregar = buscarPainelAnexos, mesInicial }: Props) {
  const [mes, setMes] = useState(() => mesInicial ?? mesAtual(new Date()));
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
        <p className="mt-8 font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">Anexos de conta · MedSênior</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-4xl italic leading-[0.95] text-navy first-letter:uppercase sm:text-6xl">{rotuloMes(mes)}</h1>
          <div className="flex shrink-0 gap-2 pb-1">
            <BotaoMes rotulo="Mês anterior" onClick={() => irPara(deslocarMes(mes, -1))}>‹</BotaoMes>
            <BotaoMes rotulo="Próximo mês" onClick={() => irPara(deslocarMes(mes, 1))}>›</BotaoMes>
          </div>
        </div>
        <p className="mt-2 font-mono text-[11px] text-navy/45">Referência {mes.slice(5, 7)}/{mes.slice(0, 4)} no portal MedSênior</p>

        {estado.kind === 'carregando' && <Carregando />}
        {estado.kind === 'erro' && <Erro mensagem={estado.mensagem} sessao={estado.sessao} onTentar={recarregar} />}
        {estado.kind === 'pronto' && <Conteudo painel={estado.painel} onRecarregar={recarregar} />}
      </main>
    </div>
  );
}

function Conteudo({ painel, onRecarregar }: { painel: PainelAnexos; onRecarregar: () => void }) {
  const { totais } = painel;
  const atencao = totais.conferir + totais.pendencias;
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy/10 bg-navy/10 shadow-soft sm:grid-cols-4 animate-slide-in">
        <Total rotulo="Contas" valor={totais.total} />
        <Total rotulo="Anexadas" valor={totais.anexadas} tom="text-success" />
        <Total rotulo="Não enviadas" valor={totais.naoEnviadas} />
        <Total rotulo="Pedem atenção" valor={atencao} tom={atencao > 0 ? 'text-danger' : undefined} />
      </dl>

      {painel.aviso && (
        <p className="mt-6 rounded-2xl border border-danger/30 bg-danger/8 p-4 font-serif text-base italic leading-snug text-navy">
          {painel.aviso}
        </p>
      )}

      {!painel.aviso && painel.contas.length === 0 && (
        <p className="mt-12 text-center font-serif text-2xl italic text-navy/50">
          O robô ainda não rodou na Referência {painel.referencia}.
        </p>
      )}

      {ORDEM.map((status, i) => {
        const contas = painel.contas.filter((c) => c.status === status);
        if (contas.length === 0) return null;
        const estilo = ESTILO[status];
        return (
          <section key={status} className="mt-10 animate-slide-in" style={{ animationDelay: `${80 * (i + 1)}ms` }}>
            <CabecalhoSecao ponto={estilo.ponto} texto={estilo.texto} rotulo={estilo.rotulo} quantidade={contas.length}>
              {estilo.explica}
            </CabecalhoSecao>
            <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
              {contas.map((c) => (
                <LinhaConta key={c.conta} conta={c} mes={painel.mes} />
              ))}
            </ul>
          </section>
        );
      })}

      <Robo painel={painel} onRecarregar={onRecarregar} />
    </>
  );
}

function LinhaConta({ conta, mes }: { conta: ContaPainel; mes: string }) {
  return (
    <li className="border-t border-navy/8 py-3 first:border-t-0">
      <p className="truncate font-serif text-lg leading-snug text-navy">{conta.paciente}</p>
      <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaConta(conta)}</p>
      {conta.nota && <p className="mt-0.5 text-[12px] leading-snug text-navy/45">{conta.nota}</p>}
      {conta.status === 'conferir' && (
        <p className="mt-1 break-all font-mono text-[11px] leading-snug text-amber-600">
          Se NÃO estiver no portal: {comandoReenvio(mes, conta.conta)}
        </p>
      )}
    </li>
  );
}

function Robo({ painel, onRecarregar }: { painel: PainelAnexos; onRecarregar: () => void }) {
  const ultima = painel.ultimaExecucao;
  return (
    <section className="mt-12 overflow-hidden rounded-2xl bg-navy-deep text-bone shadow-lifted">
      <div className="border-b border-bone/10 px-5 py-5">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-amber">Robô</p>
        <p className="mt-1 font-serif text-2xl italic leading-tight">Anexar no computador do Daniel</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone/60">
          Na pasta <span className="font-mono text-bone/80">femme-vita-faturamento</span>, rode primeiro o ensaio: ele escolhe os
          documentos de cada conta sem anexar nada. Se o plano estiver certo, rode o de verdade.
        </p>
      </div>
      <Comando rotulo="Ensaio" texto={comandoAnexos(painel.mes, true)} />
      <Comando rotulo="Anexar" texto={comandoAnexos(painel.mes, false)} />
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-bone/50">
          {ultima
            ? `Última execução${ultima.dryRun ? ' (ensaio)' : ''}: ${new Date(ultima.inicio).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })} · ${ultima.resumo}`
            : 'O robô ainda não rodou nesta Referência.'}
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
```

- [ ] **Step 2: Rota**

Em `src/App.tsx`:
- importe `PainelAnexosScreen` de `./components/PainelAnexosScreen`;
- logo depois da linha `if (tela === 'faturamento-sadt') return <PainelSadtScreen />;`, acrescente:

```tsx
  // ?tela=anexos vem do card "Anexos MedSênior" do Hub (Master).
  if (tela === 'anexos') return <PainelAnexosScreen />;
```

- [ ] **Step 3: Vitrine**

Em `src/dev/Demo.tsx`:
1. Importe `PainelAnexosScreen` e o tipo `PainelAnexos`.
2. Crie a fixture fictícia abaixo.
3. Acrescente três casos no `switch`, antes do `default`.
4. Inclua `painel-anexos, painel-anexos-vazio, painel-anexos-aviso` na lista de demos do `default`.

Fixture:

```tsx
const PAINEL_ANEXOS: PainelAnexos = {
  mes: '2026-11',
  referencia: '11/2026',
  aviso: null,
  ultimaExecucao: { inicio: '2026-11-05T13:00:00.000Z', fim: '2026-11-05T13:20:00.000Z', dryRun: false, resumo: '3 anexadas, 1 pendências, 1 a conferir, 0 já anexadas antes' },
  totais: { total: 6, anexadas: 3, pendencias: 1, conferir: 1, naoEnviadas: 1 },
  contas: [
    { conta: '18000001', nr: '150000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', status: 'conferir', arquivos: ['Guia_SADT_MARIA DE TESTE LIMA_2026.10.02.pdf'], motivo: null, em: '2026-11-05T13:05:00.000Z', nota: null },
    { conta: '18000002', nr: '140000000', tipo: 'honorarios', paciente: 'ANA EXEMPLO SOUZA', status: 'pendencia', arquivos: [], motivo: 'falta guia de honorários assinada', em: '2026-11-05T13:06:00.000Z', nota: null },
    { conta: '18000003', nr: '150000000', tipo: 'sadt', paciente: 'BIA TESTE COSTA', status: 'nao_enviada', arquivos: [], motivo: null, em: '2026-11-05T13:00:00.000Z', nota: null },
    { conta: '18000004', nr: '140000000', tipo: 'honorarios', paciente: 'CIDA FICTICIA ROCHA', status: 'anexada', arquivos: ['Guia_internação_CIDA FICTICIA ROCHA.pdf', 'Descrição_cirúrgica_CIDA FICTICIA ROCHA.pdf', 'Guia_honorários_assinada_CIDA FICTICIA ROCHA.pdf'], motivo: null, em: '2026-11-05T13:10:00.000Z', nota: null },
    { conta: '18000005', nr: '150000000', tipo: 'sadt', paciente: 'DORA EXEMPLO DIAS', status: 'anexada', arquivos: ['Guia_SADT_DORA EXEMPLO DIAS_2026.10.15.pdf'], motivo: null, em: '2026-11-05T13:12:00.000Z', nota: 'anexada à mão em 03/10/2026, antes do robô' },
    { conta: '18000006', nr: '150000000', tipo: 'sadt', paciente: 'EVA TESTE MOURA', status: 'anexada', arquivos: ['Guia_SADT_EVA TESTE MOURA_2026.10.20.pdf'], motivo: null, em: '2026-11-05T13:14:00.000Z', nota: null },
  ],
};
```

Casos:

```tsx
    case 'painel-anexos':
      return <PainelAnexosScreen mesInicial="2026-11" carregar={async () => PAINEL_ANEXOS} />;
    case 'painel-anexos-vazio':
      return (
        <PainelAnexosScreen
          mesInicial="2026-12"
          carregar={async (mes) => ({ ...PAINEL_ANEXOS, mes, referencia: `${mes.slice(5, 7)}/${mes.slice(0, 4)}`, contas: [], ultimaExecucao: null, totais: { total: 0, anexadas: 0, pendencias: 0, conferir: 0, naoEnviadas: 0 } })}
        />
      );
    case 'painel-anexos-aviso':
      return (
        <PainelAnexosScreen
          mesInicial="2026-11"
          carregar={async () => ({ ...PAINEL_ANEXOS, contas: [], totais: { total: 0, anexadas: 0, pendencias: 0, conferir: 0, naoEnviadas: 0 }, aviso: 'O registro deste mês não abriu ou está fora do formato. Não rode o robô antes de conferir o arquivo _anexos.json (avise o Daniel).' })}
        />
      );
```

- [ ] **Step 4: Conferir**

Run: `npx tsc -b && npx vitest run && npx eslint src`
Expected: tudo passa.

Depois, no servidor de desenvolvimento (entrada `arquivo`, porta 5181), abra as três vitrines: `?demo=painel-anexos`, `?demo=painel-anexos-vazio` e `?demo=painel-anexos-aviso`. Confira:
1. a ordem das seções: Conferir no portal, Pendências, Ainda não enviadas, Anexadas;
2. o comando de reenvio só na conta "conferir";
3. o botão Copiar;
4. a largura de celular (375 px) sem rolagem horizontal;
5. as setas de mês.

Tire um print de cada vitrine.

- [ ] **Step 5: Commit**

```bash
git add src/components/PainelAnexosScreen.tsx src/App.tsx src/dev/Demo.tsx
git commit -m "feat(anexos): tela ?tela=anexos com seções, comandos do robô e vitrine"
```

---

### Task 6: Card no Hub

**Files (repo `C:\Users\User\Developer\femme-vita-hub`):**
- Modify: `config/portais.json`

- [ ] **Step 1: Acrescentar o card**

Em `config/portais.json`, logo depois do objeto `"id": "faturamento-sadt"`, acrescente:

```json
    {
      "id": "anexos-medsenior",
      "nome": "Anexos MedSênior",
      "descricao": "Os documentos que comprovam cada conta MedSênior: o que já foi anexado, o que falta e o que conferir no portal.",
      "grupo": "gestao",
      "acesso": "master",
      "tipo": "app",
      "url": "https://femme-vita-app.vercel.app/?tela=anexos",
      "abrir": "nova-aba",
      "estado": "no-ar",
      "icone": "recibo",
      "login": "conta Google",
      "para": "Daniel e Priscila"
    },
```

- [ ] **Step 2: Validar**

Run: `npm test`
Expected: passa. Os testes validam ids únicos, valores de acesso e estado, e a regra de que a equipe não vê cards Master.

Depois, no servidor de desenvolvimento (entrada `hub`, porta 5180):
- `http://localhost:5180/master` mostra o card em Gestão, ao lado de "Faturamento SADT", e ele abre em nova aba;
- `http://localhost:5180/` NÃO mostra o card.

- [ ] **Step 3: Commit**

```bash
git add config/portais.json
git commit -m "feat: card Anexos MedSênior na versão Master"
```

---

### Task 7: Publicar (só com o ok do Daniel)

- [ ] **Step 1: Pedir o ok**

Diga ao Daniel o que vai ao ar:
- o painel novo no Arquivo;
- a refatoração das peças do painel SADT;
- o card novo no Hub.

Push na `main` publica em produção pelo Vercel nos dois repos. Só siga com o "sim" dele.

- [ ] **Step 2: Push dos dois repos**

```bash
git -C C:/Users/User/Developer/femme-vita-app push origin main
git -C C:/Users/User/Developer/femme-vita-hub push origin main
```

- [ ] **Step 3: Conferir produção**

1. `https://femme-vita-app.vercel.app/api/anexos?mes=2026-10` sem sessão responde **401**.
2. O bundle de produção do Arquivo contém o texto "Anexos de conta" e o do Hub contém "Anexos MedSênior". Para conferir, busque os assets JS da página e procure o texto.
3. Com o Daniel logado, `https://femme-vita-app.vercel.app/?tela=anexos` em 10/2026 mostra **78 contas, 78 anexadas**: é a carga inicial de 04/10/2026.
