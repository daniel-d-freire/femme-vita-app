// api/_lib/upload-schema.test.ts
// Fica em _lib (e não em api/) para a Vercel não publicar o teste como função.
import { describe, expect, it } from 'vitest';
import { RequestBodySchema } from '../upload.js';

const BASE = {
  images: ['data:image/jpeg;base64,AAAA'],
  fileName: 'Guia_internação_Maria Lima.pdf',
};

function comFolderId(folderId: string) {
  return RequestBodySchema.safeParse({ ...BASE, target: { kind: 'folderId', folderId } });
}

describe('RequestBodySchema: folderId', () => {
  it('aceita um id de pasta do Drive', () => {
    expect(comFolderId('1AbC_dEf-GhIjKlMnOpQrStUvWxYz012345').success).toBe(true);
  });
  it('recusa id curto demais', () => {
    expect(comFolderId('abc').success).toBe(false);
  });
  it('recusa id vazio', () => {
    expect(comFolderId('').success).toBe(false);
  });
  it('recusa aspas, espaços e outros caracteres que quebrariam a consulta q do Drive', () => {
    expect(comFolderId("abc' or name contains 'x").success).toBe(false);
    expect(comFolderId("1AbCdEfGhIjKlMn' in parents").success).toBe(false);
    expect(comFolderId('1AbCdEfGhIjKlMn\\').success).toBe(false);
    expect(comFolderId('1AbCdEfGhIjKlMn OpQr').success).toBe(false);
  });
  it('recusa quebra de linha no fim do id', () => {
    expect(comFolderId('1AbCdEfGhIjKlMnOpQr\n').success).toBe(false);
  });
  it('não mexe no alvo pendente', () => {
    const r = RequestBodySchema.safeParse({ ...BASE, target: { kind: 'pendente', patientName: "Maria D'Ávila" } });
    expect(r.success).toBe(true);
  });
});
