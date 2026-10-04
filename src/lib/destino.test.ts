// src/lib/destino.test.ts
import { describe, expect, it } from 'vitest';
import { destinoParaRestaurar, guardarDestino } from './destino';

function armazenamentoFalso() {
  const dados = new Map<string, string>();
  return {
    dados,
    setItem: (k: string, v: string) => void dados.set(k, v),
  };
}

describe('guardarDestino', () => {
  it('guarda a busca da página antes do login', () => {
    const a = armazenamentoFalso();
    guardarDestino('?modo=sadt', a);
    expect(a.dados.get('fv_destino')).toBe('?modo=sadt');
  });
  it('não guarda nada quando não há busca', () => {
    const a = armazenamentoFalso();
    guardarDestino('', a);
    expect(a.dados.size).toBe(0);
  });
});

describe('destinoParaRestaurar', () => {
  it('restaura os destinos conhecidos quando o login voltou para "/"', () => {
    expect(destinoParaRestaurar('', '?modo=sadt')).toBe('?modo=sadt');
    expect(destinoParaRestaurar('', '?tela=faturamento-sadt')).toBe('?tela=faturamento-sadt');
    expect(destinoParaRestaurar('', '?tela=anexos')).toBe('?tela=anexos');
  });
  it('não mexe numa página que já tem busca', () => {
    expect(destinoParaRestaurar('?modo=sadt', '?tela=faturamento-sadt')).toBeNull();
  });
  it('ignora destino desconhecido e ausência de destino', () => {
    expect(destinoParaRestaurar('', '?x=https://evil.example')).toBeNull();
    expect(destinoParaRestaurar('', null)).toBeNull();
  });
});
