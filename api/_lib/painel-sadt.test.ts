// api/_lib/painel-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { hojeEmBrasilia, mapearComLimite, montarPainel, pdfDoMes } from './painel-sadt.js';

function registro(paciente: string, data: string, pdfId: string) {
  return {
    versao: 1,
    paciente,
    nomeNaGuia: paciente,
    data,
    senha: '10000000001',
    carteira: '2000000000001',
    codigoProcedimento: '98250159',
    pdf: { id: pdfId, nome: `Guia_SADT_${paciente}_${data.replace(/-/g, '.')}.pdf`, pendente: false },
    digitalizadoEm: '2026-09-30T17:00:00.000Z',
    digitalizadoPor: 'recepcao@exemplo.com',
  };
}

function entrada(status: string, extra: Record<string, unknown> = {}) {
  return { status, paciente: 'X', data: '2026-09-30', guiaPortal: null, valor: null, motivo: null, em: 'agora', ...extra };
}

function livro(guias: Record<string, unknown>, execucoes: unknown[] = []) {
  return { versao: 1, mes: '2026-09', execucoes, guias };
}

describe('pdfDoMes', () => {
  it('reconhece o PDF do mês, com ou sem sufixo de colisão', () => {
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.09.30.pdf', '2026-09')).toBe(true);
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.09.30_2.pdf', '2026-09')).toBe(true);
  });
  it('recusa outro mês e outros nomes', () => {
    expect(pdfDoMes('Guia_SADT_Ana Lima_2026.10.01.pdf', '2026-09')).toBe(false);
    expect(pdfDoMes('Guia_internação_Ana Lima.pdf', '2026-09')).toBe(false);
  });
});

describe('montarPainel', () => {
  it('registro sem livro é "falta faturar", com o PDF e quem digitalizou', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('ANA', '2026-09-30', 'p1') }],
      livro: null,
      pdfs: [],
    });
    expect(painel.guias).toEqual([
      {
        chave: 'a.json',
        paciente: 'ANA',
        data: '2026-09-30',
        status: 'falta_faturar',
        guiaPortal: null,
        valor: null,
        motivo: null,
        pdfId: 'p1',
        digitalizadoPor: 'recepcao@exemplo.com',
      },
    ]);
    expect(painel.avisoLivro).toBeNull();
  });

  it('traduz cada status do livro', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') },
        { nome: 'b.json', conteudo: registro('B', '2026-09-02', 'p2') },
        { nome: 'c.json', conteudo: registro('C', '2026-09-03', 'p3') },
        { nome: 'd.json', conteudo: registro('D', '2026-09-04', 'p4') },
        { nome: 'e.json', conteudo: registro('E', '2026-09-05', 'p5') },
      ],
      livro: livro({
        'a.json': entrada('faturada', { guiaPortal: '3320311', valor: 82.02 }),
        'b.json': entrada('finalizando', { guiaPortal: '3320312' }),
        'c.json': entrada('salva_sem_finalizar', { guiaPortal: '3320313', motivo: 'Trava 2: x' }),
        'd.json': entrada('pendencia', { motivo: 'Trava 1: y' }),
        'e.json': entrada('duplicada', { motivo: 'mesma senha de a.json' }),
      }),
      pdfs: [],
    });
    expect(painel.guias.map((g) => [g.chave, g.status, g.guiaPortal, g.motivo])).toEqual([
      ['a.json', 'faturada', '3320311', null],
      ['b.json', 'conferir', '3320312', null],
      ['c.json', 'conferir', '3320313', 'Trava 2: x'],
      ['d.json', 'pendencia', null, 'Trava 1: y'],
      ['e.json', 'duplicada', null, 'mesma senha de a.json'],
    ]);
  });

  it('registro que não abre vira "registro ilegível"', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [{ nome: 'ruim.json', conteudo: null }], livro: null, pdfs: [] });
    expect(painel.guias[0]).toMatchObject({ chave: 'ruim.json', paciente: 'ruim.json', status: 'registro_ilegivel', data: null });
  });

  it('livro fora do formato vira aviso, e as guias aparecem como "falta faturar"', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') }],
      livro: { qualquer: 'coisa' },
      pdfs: [],
    });
    expect(painel.avisoLivro).toMatch(/_faturamento\.json/);
    expect(painel.guias[0]?.status).toBe('falta_faturar');
  });

  it('entrada do livro sem registro continua aparecendo', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [],
      livro: livro({ 'sumiu.json': entrada('faturada', { paciente: 'BIA', guiaPortal: '1', valor: 82.02 }) }),
      pdfs: [],
    });
    expect(painel.guias).toEqual([
      expect.objectContaining({ chave: 'sumiu.json', paciente: 'BIA', status: 'faturada', pdfId: null }),
    ]);
  });

  it('acusa PDF do mês sem registro e ignora o de outro mês', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [{ nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') }],
      livro: null,
      pdfs: [
        { id: 'p1', nome: 'Guia_SADT_A_2026.09.01.pdf', link: 'l1' },
        { id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: 'l9' },
        { id: 'p8', nome: 'Guia_SADT_Y_2026.10.01.pdf', link: 'l8' },
      ],
    });
    expect(painel.pdfsSemRegistro).toEqual([{ id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: 'l9' }]);
  });

  it('ordena por data e depois por nome; ilegível vai para o fim', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'z.json', conteudo: null },
        { nome: 'b.json', conteudo: registro('BRUNA', '2026-09-02', 'p2') },
        { nome: 'a.json', conteudo: registro('ANA', '2026-09-02', 'p1') },
        { nome: 'c.json', conteudo: registro('CARLA', '2026-09-01', 'p3') },
      ],
      livro: null,
      pdfs: [],
    });
    expect(painel.guias.map((g) => g.paciente)).toEqual(['CARLA', 'ANA', 'BRUNA', 'z.json']);
  });

  it('totais e última execução', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('A', '2026-09-01', 'p1') },
        { nome: 'b.json', conteudo: registro('B', '2026-09-02', 'p2') },
        { nome: 'c.json', conteudo: registro('C', '2026-09-03', 'p3') },
        { nome: 'd.json', conteudo: registro('D', '2026-09-04', 'p4') },
      ],
      livro: livro(
        {
          'a.json': entrada('faturada', { guiaPortal: '1', valor: 82.02 }),
          'b.json': entrada('faturada', { guiaPortal: '2', valor: 82.02 }),
          'c.json': entrada('pendencia', { motivo: 'x' }),
        },
        [
          { inicio: '2026-10-02T10:00:00.000Z', fim: '2026-10-02T10:05:00.000Z', dryRun: true, resumo: '3 ensaios ok' },
          { inicio: '2026-10-03T10:00:00.000Z', fim: '2026-10-03T10:06:00.000Z', dryRun: false, resumo: '2 faturadas, 1 pendência' },
        ],
      ),
      pdfs: [{ id: 'p9', nome: 'Guia_SADT_Z_2026.09.15.pdf', link: null }],
    });
    expect(painel.totais).toEqual({
      digitalizadas: 4,
      faturadas: 2,
      valorFaturado: 164.04,
      faltaFaturar: 1,
      atencao: 2,
      duplicadas: 0,
    });
    expect(painel.ultimaExecucao).toEqual({
      inicio: '2026-10-03T10:00:00.000Z',
      fim: '2026-10-03T10:06:00.000Z',
      dryRun: false,
      resumo: '2 faturadas, 1 pendência',
    });
  });
});

describe('mapearComLimite', () => {
  it('preserva a ordem e nunca passa do limite de chamadas simultâneas', async () => {
    let emVoo = 0;
    let pico = 0;
    const resultado = await mapearComLimite([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return n * 10;
    });
    expect(resultado).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(pico).toBeLessThanOrEqual(3);
  });
  it('lista vazia', async () => {
    expect(await mapearComLimite([], 3, async (n: number) => n)).toEqual([]);
  });
});

describe('montarPainel com a agenda', () => {
  const agendaItem = (pacienteNome: string, data: string, status = 3) => ({
    id: `${pacienteNome}-${data}`,
    data,
    pacienteNome,
    status,
    servicoDescricao: 'Consulta Cirurgia',
    convenioId: 4,
    convenioTitulo: 'MEDSENIOR',
    convenioCarteira: null,
  });

  it('sem agenda informada, o bloco diz que a conferência está desligada', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [], livro: null, pdfs: [] });
    expect(painel.agenda).toEqual({ disponivel: false, motivo: 'conferência com a agenda desligada' });
  });

  it('agenda indisponível repassa o motivo', () => {
    const painel = montarPainel({ mes: '2026-09', registros: [], livro: null, pdfs: [], agenda: { ok: false, motivo: 'o NinSaúde não respondeu' }, hoje: '2026-10-03' });
    expect(painel.agenda).toEqual({ disponivel: false, motivo: 'o NinSaúde não respondeu' });
  });

  it('cruza a agenda com os registros e usa o livro para saber o que foi faturado', () => {
    const painel = montarPainel({
      mes: '2026-09',
      registros: [
        { nome: 'a.json', conteudo: registro('Maria Exemplo Souza', '2026-09-10', 'p1') },
        { nome: 'b.json', conteudo: registro('Bruna Teste Lima', '2026-09-11', 'p2') },
        { nome: 'ruim.json', conteudo: null },
      ],
      livro: livro({ 'a.json': entrada('faturada', { guiaPortal: '3000001', valor: 82.02 }) }),
      pdfs: [],
      agenda: {
        ok: true,
        itens: [agendaItem('Maria Exemplo Souza', '2026-09-10'), agendaItem('Bruna Teste Lima', '2026-09-11'), agendaItem('Carla Sem Guia', '2026-09-12')],
      },
      hoje: '2026-10-03',
    });
    expect(painel.agenda).toMatchObject({
      disponivel: true,
      atendidas: 3,
      digitalizadas: 2,
      faturadas: 1,
      semGuia: [{ paciente: 'Carla Sem Guia', data: '2026-09-12', servico: 'Consulta Cirurgia' }],
      guiaSemAtendimento: [],
    });
  });
});

describe('hojeEmBrasilia', () => {
  it('usa o fuso de Brasília, não o UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-02');
    expect(hojeEmBrasilia(new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-03');
  });
});
