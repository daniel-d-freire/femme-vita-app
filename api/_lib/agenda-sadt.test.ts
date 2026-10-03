// api/_lib/agenda-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { ehMedsenior, mesmaPaciente, normalizarNome, separarAgenda } from './agenda-sadt.js';

function item(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    data: '2026-09-10',
    pacienteNome: 'Maria Exemplo Souza',
    status: 3,
    servicoDescricao: 'Consulta Cirurgia',
    convenioId: 4,
    convenioTitulo: 'MEDSENIOR',
    convenioCarteira: '2000000000001',
    ...extra,
  };
}

describe('normalizarNome', () => {
  it('tira acento, caixa, pontuação e espaço repetido', () => {
    expect(normalizarNome('  Márcia   de Sant’Anna-Lima ')).toBe('MARCIA DE SANTANNA LIMA');
  });
});

describe('mesmaPaciente', () => {
  it('aceita igual ignorando acento e caixa', () => {
    expect(mesmaPaciente('MARIA EXEMPLO SOUZA', 'Maria Exemplo Souza')).toBe(true);
  });
  it('aceita o nome mais curto como prefixo com até 1 palavra a menos e pelo menos 3 palavras', () => {
    expect(mesmaPaciente('Ana Paula Modelo', 'ANA PAULA MODELO LIMA')).toBe(true);
  });
  it('recusa faltando 2 palavras, primeiro nome trocado ou nome curto demais', () => {
    expect(mesmaPaciente('Ana Paula', 'ANA PAULA MODELO LIMA')).toBe(false);
    expect(mesmaPaciente('Ana Paula Modelo', 'Paula Modelo Lima')).toBe(false);
    expect(mesmaPaciente('Ana', 'Ana')).toBe(false);
  });
});

describe('ehMedsenior', () => {
  it('reconhece pelo id 4 ou pelo título', () => {
    expect(ehMedsenior(4, null)).toBe(true);
    expect(ehMedsenior(null, 'Med Sênior')).toBe(true);
    expect(ehMedsenior(1, 'AMIL')).toBe(false);
    expect(ehMedsenior(null, null)).toBe(false);
  });
});

describe('separarAgenda', () => {
  it('atendidos de qualquer convênio, marcando quais são MedSênior', () => {
    const r = separarAgenda(
      [item(), item({ id: 2, pacienteNome: 'Bruna Teste Lima', convenioId: null, convenioTitulo: null, convenioCarteira: null })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([
      { id: '2', data: '2026-09-10', paciente: 'Bruna Teste Lima', servico: 'Consulta Cirurgia', convenio: null, medsenior: false, carteira: null },
      { id: '1', data: '2026-09-10', paciente: 'Maria Exemplo Souza', servico: 'Consulta Cirurgia', convenio: 'MEDSENIOR', medsenior: true, carteira: '2000000000001' },
    ]);
  });

  it('fora do mês, falta, cancelada e reagendada não entram', () => {
    const r = separarAgenda(
      [item({ data: '2026-08-31' }), item({ id: 2, status: 4 }), item({ id: 3, status: 5 }), item({ id: 4, status: 7 })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([]);
    expect(r.semBaixa).toEqual([]);
  });

  it('sem baixa: MedSênior agendada ou confirmada antes de hoje', () => {
    const r = separarAgenda(
      [
        item({ id: 1, status: 0, data: '2026-09-29' }),
        item({ id: 2, status: 2, data: '2026-09-30' }),
        item({ id: 3, status: 0, data: '2026-09-30', convenioId: 1, convenioTitulo: 'AMIL' }),
      ],
      '2026-09',
      '2026-09-30',
    );
    expect(r.semBaixa).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-29', servico: 'Consulta Cirurgia', status: 'agendada' }]);
  });

  it('carteira numérica vira texto só com dígitos; item fora do formato é ignorado', () => {
    const r = separarAgenda([item({ convenioCarteira: 2000000000001 }), { lixo: true }], '2026-09', '2026-10-03');
    expect(r.atendidos.map((a) => a.carteira)).toEqual(['2000000000001']);
  });
});
