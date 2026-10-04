// src/lib/anexos.test.ts
import { describe, expect, it } from 'vitest';
import { comandoAnexos, comandoReenvio, detalheDaConta, mesAtual, rotuloTipo, type ContaPainel } from './anexos';

const conta = (extra: Partial<ContaPainel> = {}): ContaPainel => ({
  conta: '12345678', nr: '140000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', status: 'anexada',
  arquivos: ['Guia_SADT_MARIA DE TESTE LIMA_2026.10.01.pdf'], motivo: null, em: '2026-11-05T12:00:00.000Z', nota: null, ...extra,
});

describe('mês e comandos', () => {
  it('mês atual no formato AAAA-MM', () => {
    expect(mesAtual(new Date(2026, 9, 4))).toBe('2026-10');
  });
  it('comandos do robô com a Referência MM/AAAA', () => {
    expect(comandoAnexos('2026-11', true)).toBe('npm run anexar-contas -- 11/2026 --dry-run');
    expect(comandoAnexos('2026-11', false)).toBe('npm run anexar-contas -- 11/2026');
    expect(comandoReenvio('2026-11', '12345678')).toBe('npm run anexar-contas -- 11/2026 --conta 12345678 --reenviar 12345678');
  });
});

describe('textos', () => {
  it('rótulo do tipo', () => {
    expect(rotuloTipo('sadt')).toBe('SADT');
    expect(rotuloTipo('honorarios')).toBe('Honorários');
    expect(rotuloTipo('desconhecido')).toBe('Tipo não previsto');
  });
  it('detalhe por status', () => {
    expect(detalheDaConta(conta())).toBe('Conta 12345678 · SADT · Guia_SADT_MARIA DE TESTE LIMA_2026.10.01.pdf');
    expect(detalheDaConta(conta({ status: 'pendencia', motivo: 'sem guia SADT digitalizada' }))).toBe('Conta 12345678 · SADT · sem guia SADT digitalizada');
    expect(detalheDaConta(conta({ status: 'nao_enviada', arquivos: [] }))).toBe('Conta 12345678 · SADT · ainda não passou pelo robô');
    expect(detalheDaConta(conta({ status: 'conferir', arquivos: ['a.pdf', 'b.pdf'] }))).toBe('Conta 12345678 · SADT · a.pdf · b.pdf');
  });
  it('pendência sem motivo e anexada sem arquivos', () => {
    expect(detalheDaConta(conta({ status: 'pendencia', motivo: null }))).toBe('Conta 12345678 · SADT · sem motivo registrado');
    expect(detalheDaConta(conta({ status: 'anexada', arquivos: [] }))).toBe('Conta 12345678 · SADT');
  });
});
