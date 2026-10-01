// api/_lib/sadt.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SadtUploadSchema,
  montarRegistro,
  nomeCombinaComData,
  nomeDoRegistro,
  nomePdfDoRegistro,
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
  it('recusa data inexistente no calendário', () => {
    expect(SadtUploadSchema.safeParse({ ...SADT, data: '2026-02-30' }).success).toBe(false);
    expect(SadtUploadSchema.safeParse({ ...SADT, data: '2026-13-01' }).success).toBe(false);
  });
  it('aceita 29 de fevereiro de ano bissexto', () => {
    expect(SadtUploadSchema.safeParse({ ...SADT, data: '2028-02-29' }).success).toBe(true);
  });
  it('aceita senha, carteira e código vazios (o robô trata como pendência)', () => {
    const parsed = SadtUploadSchema.parse({ ...SADT, senha: '', carteira: '  ', codigoProcedimento: '' });
    expect(parsed.senha).toBe('');
    expect(parsed.carteira).toBe('');
    expect(parsed.codigoProcedimento).toBe('');
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
  it('recusa caracteres que não valem em nome de arquivo', () => {
    expect(nomeSadtValido('Guia_SADT_a/b_2026.10.01.pdf')).toBe(false);
    expect(nomeSadtValido('Guia_SADT_a\\b_2026.10.01.pdf')).toBe(false);
    expect(nomeSadtValido('Guia_SADT_a\nb_2026.10.01.pdf')).toBe(false);
  });
  it('recusa o nome já com sufixo de colisão: quem pede é sempre o nome base', () => {
    expect(nomeSadtValido('Guia_SADT_A_2026.10.01_2.pdf')).toBe(false);
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

describe('nomeSemColisao sem diferenciar maiúsculas', () => {
  it('trata Maria Lima e MARIA LIMA como o mesmo nome e mantém a caixa pedida', () => {
    expect(
      nomeSemColisao('Guia_SADT_MARIA LIMA_2026.09.30.pdf', ['Guia_SADT_Maria Lima_2026.09.30.pdf']),
    ).toBe('Guia_SADT_MARIA LIMA_2026.09.30_2.pdf');
  });
  it('colide também com extensão em maiúsculas', () => {
    expect(nomeSemColisao('X_2026.09.30.pdf', ['X_2026.09.30.PDF'])).toBe('X_2026.09.30_2.pdf');
    expect(nomeSemColisao('X_2026.09.30.pdf', ['X_2026.09.30.PDF'])).not.toBe('X_2026.09.30.pdf');
  });
  it('pula o sufixo que só difere na caixa', () => {
    expect(nomeSemColisao('X_2026.09.30.pdf', ['x_2026.09.30.pdf', 'X_2026.09.30_2.PDF'])).toBe(
      'X_2026.09.30_3.pdf',
    );
  });
});

describe('pastaDoMes e nomeDoRegistro', () => {
  it('a pasta do mês é AAAA.MM', () => {
    expect(pastaDoMes('2026-09-30')).toBe('2026.09');
  });
  it('o registro tem o nome do PDF com .json', () => {
    expect(nomeDoRegistro('Guia_SADT_A_2026.09.30_2.pdf')).toBe('Guia_SADT_A_2026.09.30_2.json');
  });
  it('nomePdfDoRegistro faz o caminho de volta, sem diferenciar a caixa da extensão', () => {
    expect(nomePdfDoRegistro('Guia_SADT_A_2026.09.30_2.json')).toBe('Guia_SADT_A_2026.09.30_2.pdf');
    expect(nomePdfDoRegistro('Guia_SADT_A_2026.09.30.JSON')).toBe('Guia_SADT_A_2026.09.30.pdf');
  });
});

describe('nomeCombinaComData', () => {
  it('é true quando o nome termina na data da guia', () => {
    expect(nomeCombinaComData('Guia_SADT_A_2026.09.30.pdf', '2026-09-30')).toBe(true);
  });
  it('é false quando a data do nome é outra', () => {
    expect(nomeCombinaComData('Guia_SADT_A_2026.09.29.pdf', '2026-09-30')).toBe(false);
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
  afterEach(() => vi.restoreAllMocks());

  it('devolve true quando uma tentativa posterior dá certo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined);
    expect(await tentarAte(3, 0, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('devolve false depois de esgotar as tentativas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error('rede'));
    expect(await tentarAte(3, 0, fn)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
