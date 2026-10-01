// src/lib/sadt.test.ts
import { describe, expect, it } from 'vitest';
import { avisosSadt, dataBrParaIso, isoParaDataBr, nomeArquivoSadt, senhaPareceValida } from './sadt';

describe('dataBrParaIso', () => {
  it('converte DD/MM/AAAA para ISO', () => {
    expect(dataBrParaIso('30/09/2026')).toBe('2026-09-30');
  });
  it('aceita dia e mês com um dígito', () => {
    expect(dataBrParaIso('1/10/2026')).toBe('2026-10-01');
  });
  it('ignora espaços nas pontas', () => {
    expect(dataBrParaIso(' 01/10/2026 ')).toBe('2026-10-01');
  });
  it('recusa data que não existe', () => {
    expect(dataBrParaIso('31/09/2026')).toBeNull();
    expect(dataBrParaIso('29/02/2026')).toBeNull();
    expect(dataBrParaIso('00/10/2026')).toBeNull();
  });
  it('recusa ano fora de 2000-2099 e aceita 29/02 de ano bissexto', () => {
    expect(dataBrParaIso('01/01/0999')).toBeNull();
    expect(dataBrParaIso('01/01/2100')).toBeNull();
    expect(dataBrParaIso('29/02/2028')).toBe('2028-02-29');
  });
  it('recusa formato errado', () => {
    expect(dataBrParaIso('2026-09-30')).toBeNull();
    expect(dataBrParaIso('')).toBeNull();
    expect(dataBrParaIso('30/9/26')).toBeNull();
  });
});

describe('isoParaDataBr', () => {
  it('volta para DD/MM/AAAA', () => {
    expect(isoParaDataBr('2026-09-30')).toBe('30/09/2026');
  });
});

describe('nomeArquivoSadt', () => {
  it('monta o nome com a data em AAAA.MM.DD', () => {
    expect(nomeArquivoSadt('Maria Lima', '2026-10-01')).toBe('Guia_SADT_Maria Lima_2026.10.01.pdf');
  });
  it('preserva acentos e caixa alta da pasta', () => {
    expect(nomeArquivoSadt('ANA CONCEIÇÃO', '2026-09-30')).toBe('Guia_SADT_ANA CONCEIÇÃO_2026.09.30.pdf');
  });
  it('tira caracteres proibidos e espaços repetidos', () => {
    expect(nomeArquivoSadt(' Ana  / Lima? ', '2026-09-30')).toBe('Guia_SADT_Ana Lima_2026.09.30.pdf');
  });
  it('tira os 9 caracteres proibidos do Windows de uma vez', () => {
    expect(nomeArquivoSadt('A\\B/C:D*E?F"G<H>I|J', '2026-09-30')).toBe('Guia_SADT_ABCDEFGHIJ_2026.09.30.pdf');
  });
});

describe('senhaPareceValida', () => {
  it('aceita a senha de 11 dígitos observada no portal', () => {
    expect(senhaPareceValida('10022159716')).toBe(true);
  });
  it('recusa letra, vazio e senha curta demais', () => {
    expect(senhaPareceValida('1002215971O')).toBe(false);
    expect(senhaPareceValida('')).toBe(false);
    expect(senhaPareceValida('12345')).toBe(false);
  });
});

describe('avisosSadt', () => {
  const ok = { eConsulta: true, senha: '10022159716', confiancaSenha: 0.99, confiancaData: 0.99 };

  it('não avisa nada quando é consulta e tudo veio com confiança alta', () => {
    expect(avisosSadt(ok)).toEqual([]);
  });
  it('avisa quando não é consulta', () => {
    expect(avisosSadt({ ...ok, eConsulta: false })).toEqual(['nao_e_consulta']);
  });
  it('avisa senha com confiança baixa', () => {
    expect(avisosSadt({ ...ok, confiancaSenha: 0.8 })).toEqual(['senha_duvidosa']);
  });
  it('avisa senha inválida mesmo com confiança alta', () => {
    expect(avisosSadt({ ...ok, senha: '' })).toEqual(['senha_duvidosa']);
  });
  it('não avisa quando a confiança é exatamente 0.95', () => {
    expect(avisosSadt({ ...ok, confiancaSenha: 0.95, confiancaData: 0.95 })).toEqual([]);
  });
  it('avisa na dúvida quando a confiança vem inválida', () => {
    expect(avisosSadt({ ...ok, confiancaSenha: Number.NaN })).toEqual(['senha_duvidosa']);
    expect(avisosSadt({ ...ok, confiancaData: Number.NaN })).toEqual(['data_duvidosa']);
  });
  it('avisa data com confiança baixa', () => {
    expect(avisosSadt({ ...ok, confiancaData: 0.5 })).toEqual(['data_duvidosa']);
  });
});
