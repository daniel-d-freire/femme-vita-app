// api/_lib/drive-query.ts
/**
 * Escapa um texto para entrar entre apóstrofos numa consulta `q` do Drive.
 * A barra invertida vem primeiro: se o apóstrofo fosse escapado antes, a barra
 * que acabou de entrar seria dobrada e o apóstrofo voltaria a fechar a string.
 */
export function escaparConsultaDrive(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
