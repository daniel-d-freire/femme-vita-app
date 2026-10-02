// api/_lib/drive-query.test.ts
import { describe, expect, it } from 'vitest';
import { escaparConsultaDrive } from './drive-query.js';

// String.raw deixa a barra invertida literal, sem a dobra do escape do JavaScript.
describe('escaparConsultaDrive', () => {
  it('dobra a barra invertida e põe barra antes do apóstrofo', () => {
    // entrada:  a\b'c   saída:  a\\b\'c
    expect(escaparConsultaDrive(String.raw`a\b'c`)).toBe(String.raw`a\\b\'c`);
  });

  it('escapa a barra primeiro: a barra do apóstrofo escapado não é dobrada de novo', () => {
    // entrada:  \'   saída:  \\\'  (barra dobrada + apóstrofo escapado)
    expect(escaparConsultaDrive(String.raw`\'`)).toBe(String.raw`\\\'`);
  });

  it('escapa o apóstrofo de um nome comum', () => {
    expect(escaparConsultaDrive("Maria D'Ávila")).toBe(String.raw`Maria D\'Ávila`);
  });

  it('escapa todas as ocorrências', () => {
    expect(escaparConsultaDrive("''")).toBe(String.raw`\'\'`);
    expect(escaparConsultaDrive(String.raw`\\`)).toBe(String.raw`\\\\`);
  });

  it('deixa intacto o texto sem barra nem apóstrofo', () => {
    expect(escaparConsultaDrive('Ana Souza')).toBe('Ana Souza');
    expect(escaparConsultaDrive('')).toBe('');
  });
});
