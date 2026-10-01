// src/lib/useDestino.test.ts
import { describe, expect, it } from 'vitest';
import { alvoDoDestino, nomeBaseDoDestino } from './useDestino';

describe('alvoDoDestino', () => {
  it('pasta casada vira folderId', () => {
    expect(alvoDoDestino({ kind: 'folder', folder: { id: 'p1', name: 'Ana' } })).toEqual({
      kind: 'folderId',
      folderId: 'p1',
    });
  });
  it('sem pasta vai para _Pendentes com o nome', () => {
    expect(alvoDoDestino({ kind: 'pendente', name: 'Ana Nova' })).toEqual({
      kind: 'pendente',
      patientName: 'Ana Nova',
    });
  });
});

describe('nomeBaseDoDestino', () => {
  it('usa o nome canônico da pasta quando casou', () => {
    expect(nomeBaseDoDestino({ kind: 'folder', folder: { id: 'p1', name: 'ANA SOUZA' } })).toBe('ANA SOUZA');
  });
  it('usa o nome lido quando foi para _Pendentes', () => {
    expect(nomeBaseDoDestino({ kind: 'pendente', name: 'Ana Nova' })).toBe('Ana Nova');
  });
});
