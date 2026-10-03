// api/_lib/ninsaude.test.ts
import { describe, expect, it, vi } from 'vitest';
import { lerAgendaNinsaude } from './ninsaude.js';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('lerAgendaNinsaude', () => {
  it('sem token configurado não chama a API', async () => {
    const buscar = vi.fn();
    expect(await lerAgendaNinsaude(undefined, '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'token do NinSaúde não configurado' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('troca o refresh com X-Grant-Type e lê a agenda com bearer minúsculo', async () => {
    const buscar = vi.fn(async (url: string) =>
      url.includes('oauth2/token') ? json({ access_token: 'ACESSO' }) : json({ result: [{ id: 1 }] }),
    );
    const r = await lerAgendaNinsaude('REFRESH', '2026-09-01', '2026-09-30', buscar);
    expect(r).toEqual({ ok: true, itens: [{ id: 1 }] });
    const [urlToken, initToken] = buscar.mock.calls[0] as [string, RequestInit];
    expect(urlToken).toBe('https://api.ninsaude.com/v1/oauth2/token');
    expect((initToken.headers as Record<string, string>)['X-Grant-Type']).toBe('refresh_token');
    expect(String(initToken.body)).toContain('refresh_token=REFRESH');
    const [urlAgenda, initAgenda] = buscar.mock.calls[1] as [string, RequestInit];
    expect(urlAgenda).toBe('https://api.ninsaude.com/v1/atendimento_agenda/listar?dataInicial=2026-09-01&dataFinal=2026-09-30');
    expect((initAgenda.headers as Record<string, string>).Authorization).toBe('bearer ACESSO');
  });

  it('token recusado', async () => {
    const buscar = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'o NinSaúde recusou o token (HTTP 400)' });
  });

  it('agenda recusada ou sem result', async () => {
    const recusa = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'A' }) : json({}, 401)));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', recusa)).toEqual({ ok: false, motivo: 'o NinSaúde recusou a leitura da agenda (HTTP 401)' });
    const semResult = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'A' }) : json({ outra: 1 })));
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', semResult)).toEqual({ ok: false, motivo: 'a agenda veio num formato inesperado' });
  });

  it('rede fora do ar', async () => {
    const buscar = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'o NinSaúde não respondeu' });
  });
});

describe('lerAgendaNinsaude com corpo da agenda quebrado', () => {
  it('JSON inválido na agenda é formato inesperado', async () => {
    const buscar = vi.fn(async (url: string) =>
      url.includes('oauth2') ? json({ access_token: 'A' }) : new Response('{quebrado', { status: 200 }),
    );
    expect(await lerAgendaNinsaude('R', '2026-09-01', '2026-09-30', buscar)).toEqual({ ok: false, motivo: 'a agenda veio num formato inesperado' });
  });
});
