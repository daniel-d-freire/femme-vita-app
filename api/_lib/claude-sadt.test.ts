// api/_lib/claude-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { extrairJson } from './claude.js';
import { validarRespostaSadt } from './claude-sadt.js';

const RESPOSTA = {
  e_guia_sadt: true,
  patient_name: 'MARIA DE TESTE LIMA',
  data_autorizacao: '30/09/2026',
  senha: '10000000001',
  carteira: '2000000000001',
  codigo_procedimento: '98250159',
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
});
