import { describe, expect, it } from 'vitest';
import { estimateDataUrlBytes, fitWithin, payloadBytes } from './camera';

describe('fitWithin', () => {
  it('reduz proporcionalmente quando o lado maior passa do teto', () => {
    expect(fitWithin(3024, 4032, 2600)).toEqual({ width: 1950, height: 2600, scale: 2600 / 4032 });
  });

  it('não amplia imagens menores que o teto', () => {
    expect(fitWithin(800, 1100, 2600)).toEqual({ width: 800, height: 1100, scale: 1 });
  });

  it('usa a largura como lado maior em paisagem', () => {
    const r = fitWithin(4000, 3000, 1000);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(750);
  });
});

describe('estimateDataUrlBytes', () => {
  it('estima 3/4 do tamanho do base64 após a vírgula', () => {
    const b64 = 'A'.repeat(4000);
    expect(estimateDataUrlBytes(`data:image/jpeg;base64,${b64}`)).toBe(3000);
  });

  it('funciona com PNG', () => {
    const b64 = 'A'.repeat(400);
    expect(estimateDataUrlBytes(`data:image/png;base64,${b64}`)).toBe(300);
  });
});

describe('payloadBytes', () => {
  it('soma o comprimento das data URLs', () => {
    expect(payloadBytes(['abc', 'de'])).toBe(5);
  });

  it('retorna 0 para lista vazia', () => {
    expect(payloadBytes([])).toBe(0);
  });
});
