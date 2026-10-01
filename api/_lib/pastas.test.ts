// api/_lib/pastas.test.ts
import { describe, expect, it } from 'vitest';
import { pastasDePacientes } from './pastas.js';

describe('pastasDePacientes', () => {
  it('tira as pastas de sistema que começam com _', () => {
    const pastas = [
      { id: '1', name: 'Ana Souza' },
      { id: '2', name: '_Pendentes' },
      { id: '3', name: '_SADT' },
      { id: '4', name: 'MARIA LIMA' },
    ];
    expect(pastasDePacientes(pastas).map((p) => p.id)).toEqual(['1', '4']);
  });
});
