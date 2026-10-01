// api/_lib/sadt.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  SadtUploadSchema,
  montarRegistro,
  nomeDoRegistro,
  nomeSadtValido,
  nomeSemColisao,
  pastaDoMes,
  tentarAte,
} from './sadt.js';

const SADT = {
  paciente: 'MARIA DE TESTE LIMA',
  nomeNaGuia: 'MARIA DE TESTE LIMA',
  data: '2026-09-30',
  senha: '10000000001',
  carteira: '2000000000001',
  codigoProcedimento: '98250159',
};

describe('SadtUploadSchema', () => {
  it('aceita o payload do cliente', () => {
    expect(SadtUploadSchema.parse(SADT)).toEqual(SADT);
  });
  it('apara espaços', () => {
    expect(SadtUploadSchema.parse({ ...SADT, senha: ' 10000000001 ' }).senha).toBe('10000000001');
  });
  it('recusa data fora de AAAA-MM-DD', () => {
    expect(SadtUploadSchema.safeParse({ ...SADT, data: '30/09/2026' }).success).toBe(false);
  });
  it('recusa paciente vazia', () => {
    expect(SadtUploadSchema.safeParse({ ...SADT, paciente: '  ' }).success).toBe(false);
  });
});

describe('nomeSadtValido', () => {
  it('aceita o padrão Guia_SADT_<Paciente>_<AAAA.MM.DD>.pdf', () => {
    expect(nomeSadtValido('Guia_SADT_Maria Lima_2026.10.01.pdf')).toBe(true);
  });
  it('recusa outros nomes', () => {
    expect(nomeSadtValido('Guia_internação_Maria Lima.pdf')).toBe(false);
    expect(nomeSadtValido('Guia_SADT_Maria Lima_2026-10-01.pdf')).toBe(false);
  });
});

describe('nomeSemColisao', () => {
  it('mantém o nome quando não existe na pasta', () => {
    expect(nomeSemColisao('Guia_SADT_A_2026.09.30.pdf', ['outro.pdf'])).toBe('Guia_SADT_A_2026.09.30.pdf');
  });
  it('acrescenta _2 quando o nome já existe', () => {
    expect(nomeSemColisao('Guia_SADT_A_2026.09.30.pdf', ['Guia_SADT_A_2026.09.30.pdf'])).toBe(
      'Guia_SADT_A_2026.09.30_2.pdf',
    );
  });
  it('pula para _3 quando _2 também existe', () => {
    expect(
      nomeSemColisao('Guia_SADT_A_2026.09.30.pdf', ['Guia_SADT_A_2026.09.30.pdf', 'Guia_SADT_A_2026.09.30_2.pdf']),
    ).toBe('Guia_SADT_A_2026.09.30_3.pdf');
  });
});

describe('pastaDoMes e nomeDoRegistro', () => {
  it('a pasta do mês é AAAA.MM', () => {
    expect(pastaDoMes('2026-09-30')).toBe('2026.09');
  });
  it('o registro tem o nome do PDF com .json', () => {
    expect(nomeDoRegistro('Guia_SADT_A_2026.09.30_2.pdf')).toBe('Guia_SADT_A_2026.09.30_2.json');
  });
});

describe('montarRegistro', () => {
  it('monta o registro que o robô lê', () => {
    const registro = montarRegistro({
      sadt: SADT,
      pdf: { id: 'drive-id', nome: 'Guia_SADT_MARIA DE TESTE LIMA_2026.09.30.pdf' },
      pendente: false,
      email: 'recepcao@exemplo.com',
      agora: new Date('2026-09-30T17:02:11.000Z'),
    });
    expect(registro).toEqual({
      versao: 1,
      paciente: 'MARIA DE TESTE LIMA',
      nomeNaGuia: 'MARIA DE TESTE LIMA',
      data: '2026-09-30',
      senha: '10000000001',
      carteira: '2000000000001',
      codigoProcedimento: '98250159',
      pdf: { id: 'drive-id', nome: 'Guia_SADT_MARIA DE TESTE LIMA_2026.09.30.pdf', pendente: false },
      digitalizadoEm: '2026-09-30T17:02:11.000Z',
      digitalizadoPor: 'recepcao@exemplo.com',
    });
  });
});

describe('tentarAte', () => {
  it('devolve true quando uma tentativa posterior dá certo', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined);
    expect(await tentarAte(3, 0, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('devolve false depois de esgotar as tentativas', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rede'));
    expect(await tentarAte(3, 0, fn)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
