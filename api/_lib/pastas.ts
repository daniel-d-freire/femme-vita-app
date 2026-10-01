// api/_lib/pastas.ts
/** Pastas que começam com "_" (_Pendentes, _SADT) são de sistema, não pacientes. */
export function pastasDePacientes<T extends { name: string }>(pastas: T[]): T[] {
  return pastas.filter((p) => !p.name.startsWith('_'));
}
