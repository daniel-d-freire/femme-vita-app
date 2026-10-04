// api/_lib/painel-anexos.test.ts
import { describe, expect, it } from 'vitest';
import { montarPainelAnexos, pastaDoMesAnexos, referenciaDoMes } from './painel-anexos.js';

function entrada(status: string, extra: Record<string, unknown> = {}) {
  return { status, nr: '140000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', tipoAnexo: '1', arquivos: ['a.pdf'], motivo: null, em: '2026-11-05T12:00:00.000Z', ...extra };
}
function registro(contas: Record<string, unknown>, execucoes: unknown[] = []) {
  return { versao: 1, referencia: '11/2026', execucoes, contas };
}

describe('referência e pasta', () => {
  it('converte o mês do painel', () => {
    expect(referenciaDoMes('2026-11')).toBe('11/2026');
    expect(pastaDoMesAnexos('2026-11')).toBe('2026.11');
  });
});

describe('montarPainelAnexos', () => {
  it('sem registro: painel vazio, sem aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-11', registros: [] });
    expect(p).toMatchObject({ referencia: '11/2026', contas: [], aviso: null, ultimaExecucao: null });
    expect(p.totais.total).toBe(0);
  });

  it('enviando vira conferir; ordena conferir, pendência, não enviada, anexada', () => {
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [
        registro({
          '1': entrada('anexada', { paciente: 'ANA' }),
          '2': entrada('nao_enviada', { paciente: 'BIA' }),
          '3': entrada('pendencia', { paciente: 'CIDA', motivo: 'falta guia de honorários assinada', tipo: 'honorarios' }),
          '4': entrada('enviando', { paciente: 'DORA' }),
        }),
      ],
    });
    expect(p.contas.map((c) => [c.conta, c.status])).toEqual([
      ['4', 'conferir'],
      ['3', 'pendencia'],
      ['2', 'nao_enviada'],
      ['1', 'anexada'],
    ]);
    expect(p.totais).toEqual({ total: 4, anexadas: 1, pendencias: 1, conferir: 1, naoEnviadas: 1 });
    expect(p.contas[1]).toMatchObject({ tipo: 'honorarios', motivo: 'falta guia de honorários assinada' });
  });

  it('última execução é a última da lista; nota é mantida', () => {
    const exec = (resumo: string) => ({ inicio: 'i', fim: 'f', dryRun: false, resumo });
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [registro({ '1': entrada('anexada', { nota: 'anexada à mão' }) }, [exec('a'), exec('b')])],
    });
    expect(p.ultimaExecucao?.resumo).toBe('b');
    expect(p.contas[0]?.nota).toBe('anexada à mão');
  });

  it('nota null, não-string ou ausente vira null e o registro é aceito', () => {
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [
        registro({
          '1': entrada('anexada', { paciente: 'ANA', nota: null }),
          '2': entrada('anexada', { paciente: 'BIA', nota: 5 }),
          '3': entrada('anexada', { paciente: 'CIDA' }),
        }),
      ],
    });
    expect(p.aviso).toBeNull();
    expect(p.contas.map((c) => c.nota)).toEqual([null, null, null]);
  });

  it('campos extras na raiz e na entrada (registroSadt, tipoAnexo, outros) são aceitos', () => {
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [
        {
          ...registro({ '1': entrada('anexada', { registroSadt: 'x.json', tipoAnexo: '2', campoQualquer: { a: 1 } }) }),
          campoNaRaiz: 'qualquer',
          outro: [1, 2],
        },
      ],
    });
    expect(p.aviso).toBeNull();
    expect(p.contas).toHaveLength(1);
  });

  it('mesmo status: ordena por nome da paciente', () => {
    const p = montarPainelAnexos({
      mes: '2026-11',
      registros: [
        registro({
          '1': entrada('pendencia', { paciente: 'CIDA' }),
          '2': entrada('pendencia', { paciente: 'ANA' }),
          '3': entrada('pendencia', { paciente: 'BIA' }),
        }),
      ],
    });
    expect(p.contas.map((c) => c.paciente)).toEqual(['ANA', 'BIA', 'CIDA']);
  });

  it('execucoes vazio: ultimaExecucao é null', () => {
    const p = montarPainelAnexos({ mes: '2026-11', registros: [registro({ '1': entrada('anexada') }, [])] });
    expect(p.aviso).toBeNull();
    expect(p.ultimaExecucao).toBeNull();
  });

  it('registro que não abre ou fora do formato vira aviso', () => {
    expect(montarPainelAnexos({ mes: '2026-11', registros: [null] }).aviso).toMatch(/não abriu ou está fora do formato/);
    expect(montarPainelAnexos({ mes: '2026-11', registros: [{ versao: 1 }] }).aviso).toMatch(/fora do formato/);
  });

  it('registro de outra Referência vira aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-12', registros: [registro({})] });
    expect(p.aviso).toBe('O registro desta pasta é da Referência 11/2026, não de 12/2026.');
  });

  it('mais de um registro (pasta duplicada no Drive) vira aviso', () => {
    const p = montarPainelAnexos({ mes: '2026-11', registros: [registro({}), registro({})] });
    expect(p.aviso).toMatch(/mais de um _anexos\.json/);
    expect(p.contas).toEqual([]);
  });
});
