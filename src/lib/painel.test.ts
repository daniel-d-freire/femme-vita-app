// src/lib/painel.test.ts
import { describe, expect, it } from 'vitest';
import { comandoRobo, deslocarMes, detalheDaGuia, diaDaSemana, diasDoMes, formatarMoeda, guiasPorDia, mesAnterior, rotuloMes, type GuiaPainel } from './painel';

function guia(data: string | null, status: GuiaPainel['status'] = 'faturada'): GuiaPainel {
  return { chave: `${data}.json`, paciente: 'X', data, status, guiaPortal: null, valor: null, motivo: null, pdfId: null, digitalizadoPor: null };
}

describe('meses', () => {
  it('mês anterior, inclusive na virada do ano', () => {
    expect(mesAnterior(new Date(2026, 9, 1))).toBe('2026-09');
    expect(mesAnterior(new Date(2026, 0, 15))).toBe('2025-12');
  });
  it('desloca para frente e para trás', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2026-09', 0)).toBe('2026-09');
  });
  it('rótulo em português', () => {
    expect(rotuloMes('2026-09')).toBe('setembro de 2026');
    expect(rotuloMes('2027-03')).toBe('março de 2027');
  });
  it('dias do mês, com fevereiro bissexto', () => {
    expect(diasDoMes('2026-09')).toBe(30);
    expect(diasDoMes('2026-02')).toBe(28);
    expect(diasDoMes('2028-02')).toBe(29);
  });
  it('dia da semana (0 = domingo)', () => {
    expect(diaDaSemana('2026-09', 27)).toBe(0);
    expect(diaDaSemana('2026-10', 1)).toBe(4);
  });
});

describe('comandoRobo', () => {
  it('ensaio e de verdade', () => {
    expect(comandoRobo('2026-09', true)).toBe('npm run faturar-sadt -- 2026-09 --dry-run');
    expect(comandoRobo('2026-09', false)).toBe('npm run faturar-sadt -- 2026-09');
  });
});

describe('guiasPorDia', () => {
  it('agrupa pelo dia do mês e ignora guia sem data', () => {
    const porDia = guiasPorDia([guia('2026-09-01'), guia('2026-09-01', 'pendencia'), guia('2026-09-30'), guia(null)]);
    expect(porDia.get(1)?.map((g) => g.status)).toEqual(['faturada', 'pendencia']);
    expect(porDia.get(30)).toHaveLength(1);
    expect(porDia.size).toBe(2);
  });
});

describe('detalheDaGuia', () => {
  const base = guia('2026-09-21', 'conferir');

  it('não repete o número da guia quando o motivo já o traz', () => {
    const g = { ...base, guiaPortal: '3320330', motivo: 'guia 3320330 ficou sem confirmação de finalização; confira no portal' };
    expect(detalheDaGuia(g)).toBe('guia 3320330 ficou sem confirmação de finalização; confira no portal');
  });
  it('põe o número da guia na frente quando o motivo não o menciona', () => {
    const g = { ...base, status: 'pendencia' as const, guiaPortal: '3320330', motivo: 'paciente não encontrada no portal' };
    expect(detalheDaGuia(g)).toBe('guia 3320330 · paciente não encontrada no portal');
  });
  it('sem número de guia, mostra só o motivo', () => {
    expect(detalheDaGuia({ ...base, motivo: 'senha ilegível' })).toBe('senha ilegível');
  });
  it('sem motivo, mostra só o número, sem separador solto', () => {
    expect(detalheDaGuia({ ...base, guiaPortal: '3320330', motivo: null })).toBe('guia 3320330');
    expect(detalheDaGuia({ ...base, guiaPortal: null, motivo: null })).toBe('');
  });
  it('faturada mostra número e valor', () => {
    const g = { ...base, status: 'faturada' as const, guiaPortal: '3320330', valor: 82.02 };
    expect(detalheDaGuia(g)).toMatch(/^guia 3320330 · R\$\s82,02$/);
  });
  it('falta faturar diz quem digitalizou, ou só "digitalizada"', () => {
    expect(detalheDaGuia({ ...base, status: 'falta_faturar', digitalizadoPor: 'recepcao@exemplo.com' })).toBe('digitalizada por recepcao@exemplo.com');
    expect(detalheDaGuia({ ...base, status: 'falta_faturar', digitalizadoPor: null })).toBe('digitalizada');
  });
});

describe('formatarMoeda', () => {
  it('real com vírgula e milhar', () => {
    expect(formatarMoeda(1476.36)).toMatch(/^R\$\s1\.476,36$/);
  });
});
