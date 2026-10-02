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
