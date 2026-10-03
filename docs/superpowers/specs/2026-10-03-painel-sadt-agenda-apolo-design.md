# Painel SADT × agenda do Apolo

**Data:** 03/10/2026 · **Aprovado por:** Daniel · **App:** Arquivo (`femme-vita-app`), tela `?tela=faturamento-sadt` (card "Faturamento SADT" do Hub, versão master)

## Objetivo

Ter certeza de que 100% dos atendimentos MedSênior do mês foram digitalizados e faturados. Hoje o painel só conhece o que foi digitalizado; um atendimento sem guia digitalizada é invisível. A agenda do Apolo (NinSaúde) passa a ser a lista do que **deveria** existir, e o painel mostra a diferença.

## Decisões do Daniel

- **Todo atendimento MedSênior com baixa de atendida gera guia SADT**, inclusive retorno e consulta online. Não há serviço isento.
- **O painel lê o NinSaúde direto** (caminho A): o servidor do Arquivo chama a API pública do NinSaúde com o mesmo refresh token do VitaZap. O VitaZap não muda.

## Fonte de dados: API do NinSaúde

Mesma receita que o VitaZap usa em produção (`femme-vita-agente/lib/ninsaude/auth.ts` e `agenda.ts`, `docs/ninsaude-diagnostico.md`):

- **Token:** `POST https://api.ninsaude.com/v1/oauth2/token`, headers `Content-Type: application/x-www-form-urlencoded`, `cache-control: no-cache`, **`X-Grant-Type: refresh_token`**; corpo `grant_type=refresh_token&refresh_token=…`. O access dura 15 min: um por chamada do painel.
- **Agenda:** `GET https://api.ninsaude.com/v1/atendimento_agenda/listar?dataInicial=AAAA-MM-DD&dataFinal=AAAA-MM-DD`, header `Authorization: bearer <access>` com **`bearer` minúsculo** (maiúsculo dá 401). Resposta `{ result: [...] }`.
- **Campos usados por item:** `id`, `data`, `horaInicial`, `pacienteId`, `pacienteNome`, `status`, `servicoDescricao`, `convenioTitulo`.
- **Status:** 0 agendado, 2 confirmado, 3 atendido, 4 falta, 5 cancelado, 7 reagendado.
- **Segredo:** `NINSAUDE_REFRESH_TOKEN` nas variáveis de ambiente do projeto `femme-vita-app` na Vercel (o Daniel copia do projeto do VitaZap). Sem ele, o painel funciona como hoje e avisa que a conferência com a agenda está desligada.

## Regras (funções puras, testadas)

### Atendimentos esperados

De todos os itens do mês, entram os de convênio MedSênior: `convenioTitulo` normalizado (sem acento, maiúsculas, sem espaço) igual a `MEDSENIOR`. Deles:

- **Atendidos** (`status` 3): cada um precisa de uma guia SADT. São os "esperados".
- **Sem baixa** (`status` 0 ou 2) com data **anterior a hoje** (horário de Brasília): consulta que passou e não foi marcada como atendida nem falta. O painel lista à parte, porque sem a baixa a conferência não a enxerga.
- Falta, cancelado e reagendado ficam fora.

### Cruzamento atendimento × registro de guia

Um para um, sobre os registros do mês que o painel já lê (`Apolo/_SADT/<AAAA.MM>/*.json`):

1. **Mesma paciente:** `mesmaPaciente` do robô (`femme-vita-faturamento/src/dominio/nomes.ts`), copiada para o Arquivo: nomes normalizados iguais, ou o mais curto é prefixo do mais longo com pelo menos 3 palavras e no máximo 1 palavra a menos. Compara o `pacienteNome` da agenda com o `nomeNaGuia` **e** com o `paciente` (nome da pasta) do registro; basta um bater.
2. **Mesma data:** primeiro casa atendimento e registro da mesma paciente na mesma data.
3. **Data próxima:** o que sobrar casa com registro da mesma paciente até 3 dias de distância, marcado como **data diferente** (ex.: a leitura da data da guia errou, como na Denise em setembro/2026).
4. Paciente com dois atendimentos no mês precisa de dois registros; cada registro casa com no máximo um atendimento.

Resultado:

- **Atendida sem guia:** atendimento sem registro casado.
- **Guia sem atendimento:** registro sem atendimento casado (data errada além de 3 dias, paciente que não está como MedSênior na agenda, ou nome que não bate).
- **Casada com data diferente:** aviso na linha da guia, sem bloquear nada.

Registros ilegíveis (`registro_ilegivel`) não entram no cruzamento.

## Tela

Acrescenta ao painel atual, sem mudar o que já existe:

- **Placar no topo:** "Atendidas na agenda **N** · digitalizadas **x** de N · faturadas **y** de N". Fica verde quando x = y = N e não há "sem baixa" nem "guia sem atendimento". Digitalizada = atendimento casado com registro; faturada = casado com registro de status `faturada`.
- **Seção "Atendida sem guia"** (vermelha, no topo): paciente, data, serviço. É a lista de trabalho de quem digitaliza.
- **Seção "Sem baixa no Apolo"** (âmbar): paciente, data, serviço, status ("agendada"/"confirmada").
- **Seção "Guia sem atendimento na agenda"** (âmbar): paciente e data do registro.
- **Aviso "data diferente"** na linha da guia casada fora do dia.
- **Agenda indisponível** (token ausente, recusado, NinSaúde fora do ar ou resposta estranha): faixa discreta "Conferência com a agenda do Apolo indisponível: <motivo>"; o placar e as três seções novas somem e o resto do painel aparece normalmente.

## Arquitetura

- `api/_lib/ninsaude.ts` — token + listagem da agenda do período. Nunca lança: devolve `{ ok: true, itens }` ou `{ ok: false, motivo }`. Timeout de 12 s.
- `api/_lib/agenda-sadt.ts` — puras: `atendimentosMedsenior(itens, hoje)` (esperados e sem baixa) e `cruzarAgenda(atendimentos, registros)`; `mesmaPaciente`/`normalizarNome` copiadas do robô.
- `api/_lib/painel-sadt.ts` — `montarPainel` recebe a agenda (ou o motivo da indisponibilidade) e devolve o bloco `agenda` no JSON do painel.
- `api/sadt.ts` — busca a agenda em paralelo com o Drive.
- `src/lib/painel.ts` — tipos espelhados do bloco `agenda`.
- `src/components/PainelSadtScreen.tsx` — placar e seções novas; `src/dev/Demo.tsx` ganha um caso com agenda (dados fictícios).

Formato do bloco novo no JSON do painel:

```ts
agenda:
  | { disponivel: false; motivo: string }
  | {
      disponivel: true;
      atendidas: number;
      digitalizadas: number;
      faturadas: number;
      semGuia: { paciente: string; data: string; servico: string | null }[];
      semBaixa: { paciente: string; data: string; servico: string | null; status: 'agendada' | 'confirmada' }[];
      guiaSemAtendimento: { chave: string; paciente: string; data: string | null }[];
      dataDiferente: { chave: string; dataAgenda: string }[];
    }
```

## Testes

- Unitários (vitest) com itens fictícios: filtro de convênio e de status; "sem baixa" só no passado; cruzamento no mesmo dia, até 3 dias, além de 3 dias, dois atendimentos da mesma paciente, nome mais curto, nome que não bate; `montarPainel` com e sem agenda.
- Cliente do NinSaúde com `fetch` simulado: token recusado, `bearer` minúsculo e `X-Grant-Type` presentes, resposta sem `result`, timeout.
- **Conferência real com setembro/2026:** depois do token na Vercel, o painel de setembro tem que mostrar 62 atendimentos digitalizados e faturados. Toda diferença é investigada antes de dar a função por pronta (pode revelar nome de convênio diferente de `MEDSENIOR`, baixa esquecida ou regra de nome a ajustar).

## Fora do escopo

- O robô continua lendo só os registros; não consulta a agenda.
- Nada é escrito no Apolo.
- Sem notificação ativa (e-mail/WhatsApp) de atendimento sem guia.
