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
  // Um prazo só para a chamada inteira (token + agenda + leitura do corpo).
  const prazo = AbortSignal.timeout(TEMPO_MAXIMO_MS);
  try {
    const token = await buscar(URL_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'cache-control': 'no-cache',
        'X-Grant-Type': 'refresh_token',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: prazo,
    });
    if (!token.ok) return { ok: false, motivo: `o NinSaúde recusou o token (HTTP ${token.status})` };
    const acesso = ((await token.json().catch(() => ({}))) as { access_token?: string }).access_token;
    if (!acesso) return { ok: false, motivo: 'o NinSaúde não devolveu o token de acesso' };

    const agenda = await buscar(`${URL_AGENDA}?dataInicial=${inicio}&dataFinal=${fim}`, {
      headers: { Authorization: `bearer ${acesso}` },
      signal: prazo,
    });
    if (!agenda.ok) return { ok: false, motivo: `o NinSaúde recusou a leitura da agenda (HTTP ${agenda.status})` };
    let corpo: { result?: unknown } | null;
    try {
      corpo = (await agenda.json()) as { result?: unknown } | null;
    } catch {
      if (prazo.aborted) return { ok: false, motivo: 'o NinSaúde não respondeu' };
      return { ok: false, motivo: 'a agenda veio num formato inesperado' };
    }
    if (!corpo || !Array.isArray(corpo.result)) return { ok: false, motivo: 'a agenda veio num formato inesperado' };
    return { ok: true, itens: corpo.result };
  } catch {
    return { ok: false, motivo: 'o NinSaúde não respondeu' };
  }
}
