// api/_lib/claude-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { extrairJson } from './claude.js';
import { SADT_PROMPT, validarRespostaSadt } from './claude-sadt.js';

const RESPOSTA = {
  e_guia_sadt: true,
  patient_name: 'MARIA DE TESTE LIMA',
  data_autorizacao: '30/09/2026',
  senha: '10000000001',
  carteira: '2000000000001',
  codigo_procedimento: '98250159',
  e_consulta: true,
  confidence_name: 0.98,
  confidence_data: 0.97,
  confidence_senha: 0.96,
  error: null,
  rotation_to_apply: 0,
};

describe('extrairJson', () => {
  it('acha o JSON no meio do texto', () => {
    expect(extrairJson('aqui está:\n{"a": 1}\nfim')).toEqual({ a: 1 });
  });
  it('explica quando não há JSON', () => {
    expect(() => extrairJson('sem nada')).toThrow(/não contém JSON/);
  });
});

describe('SADT_PROMPT', () => {
  it('o molde do JSON não sugere uma rotação, lista as quatro', () => {
    expect(SADT_PROMPT).toContain('"rotation_to_apply": 0 | 90 | 180 | 270');
  });
});

describe('validarRespostaSadt', () => {
  it('aceita a resposta completa', () => {
    expect(validarRespostaSadt(RESPOSTA)).toEqual(RESPOSTA);
  });
  it('força not_recognized quando o modelo diz que não é SADT mas esqueceu o erro', () => {
    expect(validarRespostaSadt({ ...RESPOSTA, e_guia_sadt: false }).error).toBe('not_recognized');
  });
  it('mantém multiple_documents quando vier', () => {
    expect(validarRespostaSadt({ ...RESPOSTA, error: 'multiple_documents' }).error).toBe('multiple_documents');
  });
  it('recusa resposta fora do schema', () => {
    expect(() => validarRespostaSadt({ ...RESPOSTA, rotation_to_apply: 45 })).toThrow(/Schema inválido/);
  });
  it('recusa resposta sem e_consulta', () => {
    const semConsulta: Partial<typeof RESPOSTA> = { ...RESPOSTA };
    delete semConsulta.e_consulta;
    expect(() => validarRespostaSadt(semConsulta)).toThrow(/Schema inválido/);
  });
});
