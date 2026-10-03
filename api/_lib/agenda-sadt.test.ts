// api/_lib/agenda-sadt.test.ts
import { describe, expect, it } from 'vitest';
import { cruzarAgenda, ehMedsenior, mesmaPaciente, normalizarNome, separarAgenda, type Atendimento } from './agenda-sadt.js';

function item(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    data: '2026-09-10',
    pacienteNome: 'Maria Exemplo Souza',
    status: 3,
    servicoDescricao: 'Consulta Cirurgia',
    convenioId: 4,
    convenioTitulo: 'MEDSENIOR',
    convenioCarteira: '2000000000001',
    ...extra,
  };
}

describe('normalizarNome', () => {
  it('tira acento, caixa, pontuação e espaço repetido', () => {
    expect(normalizarNome('  Márcia   de Sant’Anna-Lima ')).toBe('MARCIA DE SANTANNA LIMA');
  });
});

describe('mesmaPaciente', () => {
  it('aceita igual ignorando acento e caixa', () => {
    expect(mesmaPaciente('MARIA EXEMPLO SOUZA', 'Maria Exemplo Souza')).toBe(true);
  });
  it('aceita o nome mais curto como prefixo com até 1 palavra a menos e pelo menos 3 palavras', () => {
    expect(mesmaPaciente('Ana Paula Modelo', 'ANA PAULA MODELO LIMA')).toBe(true);
  });
  it('recusa faltando 2 palavras, primeiro nome trocado ou nome curto demais', () => {
    expect(mesmaPaciente('Ana Paula', 'ANA PAULA MODELO LIMA')).toBe(false);
    expect(mesmaPaciente('Ana Paula Modelo', 'Paula Modelo Lima')).toBe(false);
    expect(mesmaPaciente('Ana', 'Ana')).toBe(false);
  });
});

describe('ehMedsenior', () => {
  it('reconhece pelo id 4 ou pelo título', () => {
    expect(ehMedsenior(4, null)).toBe(true);
    expect(ehMedsenior(null, 'Med Sênior')).toBe(true);
    expect(ehMedsenior(1, 'AMIL')).toBe(false);
    expect(ehMedsenior(null, null)).toBe(false);
  });
});

describe('separarAgenda', () => {
  it('atendidos de qualquer convênio, marcando quais são MedSênior', () => {
    const r = separarAgenda(
      [item(), item({ id: 2, pacienteNome: 'Bruna Teste Lima', convenioId: null, convenioTitulo: null, convenioCarteira: null })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([
      { id: '2', data: '2026-09-10', paciente: 'Bruna Teste Lima', servico: 'Consulta Cirurgia', convenio: null, medsenior: false, carteira: null },
      { id: '1', data: '2026-09-10', paciente: 'Maria Exemplo Souza', servico: 'Consulta Cirurgia', convenio: 'MEDSENIOR', medsenior: true, carteira: '2000000000001' },
    ]);
  });

  it('fora do mês, falta, cancelada e reagendada não entram', () => {
    const r = separarAgenda(
      [item({ data: '2026-08-31' }), item({ id: 2, status: 4 }), item({ id: 3, status: 5 }), item({ id: 4, status: 7 })],
      '2026-09',
      '2026-10-03',
    );
    expect(r.atendidos).toEqual([]);
    expect(r.semBaixa).toEqual([]);
  });

  it('sem baixa: MedSênior agendada ou confirmada antes de hoje', () => {
    const r = separarAgenda(
      [
        item({ id: 1, status: 0, data: '2026-09-29' }),
        item({ id: 2, status: 2, data: '2026-09-30' }),
        item({ id: 3, status: 0, data: '2026-09-30', convenioId: 1, convenioTitulo: 'AMIL' }),
      ],
      '2026-09',
      '2026-09-30',
    );
    expect(r.semBaixa).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-29', servico: 'Consulta Cirurgia', status: 'agendada' }]);
  });

  it('carteira numérica vira texto só com dígitos; item fora do formato é ignorado', () => {
    const r = separarAgenda([item({ convenioCarteira: 2000000000001 }), { lixo: true }], '2026-09', '2026-10-03');
    expect(r.atendidos.map((a) => a.carteira)).toEqual(['2000000000001']);
  });
});

function atendido(paciente: string, data: string, extra: Partial<Atendimento> = {}): Atendimento {
  return { id: `${paciente}-${data}`, data, paciente, servico: 'Consulta Cirurgia', convenio: 'MEDSENIOR', medsenior: true, carteira: null, ...extra };
}

function reg(chave: string, paciente: string, data: string, extra: Record<string, unknown> = {}) {
  return { chave, paciente, nomeNaGuia: paciente.toUpperCase(), carteira: null, data, faturada: true, ...extra };
}

describe('cruzarAgenda', () => {
  it('casa no mesmo dia e conta digitalizadas e faturadas', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-10'), atendido('Bruna Teste Lima', '2026-09-11')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-10'), reg('b.json', 'Bruna Teste Lima', '2026-09-11', { faturada: false })],
    );
    expect(b).toMatchObject({ disponivel: true, atendidas: 2, digitalizadas: 2, faturadas: 1, semGuia: [], guiaSemAtendimento: [], dataDiferente: [], convenioErrado: [] });
  });

  it('atendida sem guia e guia sem atendimento', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-10')],
      [],
      [reg('x.json', 'Carla Outra Pessoa', '2026-09-12')],
    );
    expect(b.semGuia).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-10', servico: 'Consulta Cirurgia' }]);
    expect(b.guiaSemAtendimento).toEqual([{ chave: 'x.json', paciente: 'Carla Outra Pessoa', data: '2026-09-12' }]);
    expect(b.digitalizadas).toBe(0);
  });

  it('até 3 dias de diferença casa com aviso; 4 dias não casa', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-16'), atendido('Bruna Teste Lima', '2026-09-20')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-18'), reg('b.json', 'Bruna Teste Lima', '2026-09-24')],
    );
    expect(b.dataDiferente).toEqual([{ chave: 'a.json', dataAgenda: '2026-09-16' }]);
    expect(b.guiaSemAtendimento.map((g) => g.chave)).toEqual(['b.json']);
  });

  it('dois atendimentos da mesma paciente precisam de duas guias', () => {
    const b = cruzarAgenda(
      [atendido('Maria Exemplo Souza', '2026-09-03'), atendido('Maria Exemplo Souza', '2026-09-24')],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-24')],
    );
    expect(b.semGuia).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-03', servico: 'Consulta Cirurgia' }]);
  });

  it('casa pelo nome da pasta, pelo nome na guia ou pela carteirinha', () => {
    const b = cruzarAgenda(
      [
        atendido('Ana Paula Modelo Oliveira', '2026-09-01'),
        atendido('Beatriz Exemplo', '2026-09-02', { carteira: '2000000000077' }),
      ],
      [],
      [
        reg('a.json', 'Ana paula Modelo', '2026-09-01', { nomeNaGuia: 'NOME LIDO ERRADO' }),
        reg('b.json', 'Beatriz Lida Errado', '2026-09-02', { nomeNaGuia: null, carteira: '2000000000077' }),
      ],
    );
    expect(b.digitalizadas).toBe(2);
  });

  it('atendimento de outro convênio só entra quando casa com guia, como convênio errado', () => {
    const b = cruzarAgenda(
      [
        atendido('Maria Exemplo Souza', '2026-09-10', { medsenior: false, convenio: null }),
        atendido('Paciente Amil Exemplo', '2026-09-10', { medsenior: false, convenio: 'AMIL' }),
      ],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-10')],
    );
    expect(b.atendidas).toBe(1);
    expect(b.digitalizadas).toBe(1);
    expect(b.semGuia).toEqual([]);
    expect(b.convenioErrado).toEqual([{ paciente: 'Maria Exemplo Souza', data: '2026-09-10', convenio: null }]);
  });

  it('casa só pelo nome lido na guia', () => {
    const b = cruzarAgenda(
      [atendido('Lucia Exemplo Prado', '2026-09-05')],
      [],
      [reg('a.json', 'Pasta Com Outro Nome', '2026-09-05', { nomeNaGuia: 'LUCIA EXEMPLO PRADO' })],
    );
    expect(b.digitalizadas).toBe(1);
  });

  it('MedSênior tem prioridade sobre outro convênio do mesmo nome no mesmo dia', () => {
    const b = cruzarAgenda(
      [
        atendido('Maria Exemplo Souza', '2026-09-10', { medsenior: false, convenio: 'AMIL', id: 'amil' }),
        atendido('Maria Exemplo Souza', '2026-09-10', { id: 'med' }),
      ],
      [],
      [reg('a.json', 'Maria Exemplo Souza', '2026-09-10')],
    );
    expect(b.semGuia).toEqual([]);
    expect(b.convenioErrado).toEqual([]);
    expect(b.atendidas).toBe(1);
    expect(b.digitalizadas).toBe(1);
  });

  it('entre guias a até 3 dias, a mais próxima vence', () => {
    const b = cruzarAgenda(
      [atendido('Rosa Teste Lima', '2026-09-10')],
      [],
      [reg('longe.json', 'Rosa Teste Lima', '2026-09-13'), reg('perto.json', 'Rosa Teste Lima', '2026-09-11')],
    );
    expect(b.dataDiferente).toEqual([{ chave: 'perto.json', dataAgenda: '2026-09-10' }]);
    expect(b.guiaSemAtendimento.map((g) => g.chave)).toEqual(['longe.json']);
  });

  it('repassa as consultas sem baixa', () => {
    const semBaixa = [{ paciente: 'Maria Exemplo Souza', data: '2026-09-29', servico: null, status: 'agendada' as const }];
    expect(cruzarAgenda([], semBaixa, []).semBaixa).toEqual(semBaixa);
  });
});
