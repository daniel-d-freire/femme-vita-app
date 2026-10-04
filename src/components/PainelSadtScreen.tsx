// src/components/PainelSadtScreen.tsx
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { ApiError } from '../lib/api';
import {
  agendaCompleta,
  buscarPainel,
  comandoRobo,
  deslocarMes,
  detalheDaGuia,
  diaDaSemana,
  diasDoMes,
  formatarMoeda,
  guiasPorDia,
  mesAnterior,
  rotuloMes,
  type AgendaPainel,
  type GuiaPainel,
  type PainelSadt,
  type StatusPainel,
} from '../lib/painel';
import { isoParaDataBr } from '../lib/sadt';
import { BotaoMes, CabecalhoSecao, Carregando, Comando, Erro, Total } from './painel-parts';

const diaMes = (iso: string) => isoParaDataBr(iso).slice(0, 5);

type Estado =
  | { kind: 'carregando' }
  | { kind: 'pronto'; painel: PainelSadt }
  | { kind: 'erro'; mensagem: string; sessao: boolean };

/** Ordem de leitura: primeiro o que pede ação humana, por último o que já está resolvido. */
const ORDEM: StatusPainel[] = ['conferir', 'pendencia', 'registro_ilegivel', 'falta_faturar', 'duplicada', 'faturada'];

const ESTILO: Record<StatusPainel, { rotulo: string; ponto: string; texto: string; explica: string }> = {
  conferir: {
    rotulo: 'Conferir no portal',
    ponto: 'bg-amber',
    texto: 'text-amber-600',
    explica: 'A guia existe no portal mas o robô não viu a finalização. Confira antes de rodar de novo.',
  },
  pendencia: {
    rotulo: 'Pendências',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'O robô parou nestas sem salvar nada. O motivo está em cada linha.',
  },
  registro_ilegivel: {
    rotulo: 'Registro ilegível',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'O arquivo do registro não abriu. Digitalize a guia de novo ou avise o Daniel.',
  },
  falta_faturar: {
    rotulo: 'Falta faturar',
    ponto: 'bg-navy',
    texto: 'text-navy',
    explica: 'Digitalizadas e ainda não passaram pelo robô.',
  },
  duplicada: {
    rotulo: 'Duplicadas',
    ponto: 'bg-cyan',
    texto: 'text-cyan-600',
    explica: 'Mesma senha de outra guia do mês. Só uma é faturada.',
  },
  faturada: {
    rotulo: 'Faturadas',
    ponto: 'bg-success',
    texto: 'text-success',
    explica: 'Finalizadas no portal MedSênior.',
  },
};

type Props = {
  /** Injetável para a vitrine de desenvolvimento. */
  carregar?: (mes: string) => Promise<PainelSadt>;
  mesInicial?: string;
};

export function PainelSadtScreen({ carregar = buscarPainel, mesInicial }: Props) {
  const [mes, setMes] = useState(() => mesInicial ?? mesAnterior(new Date()));
  const [estado, setEstado] = useState<Estado>({ kind: 'carregando' });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    carregar(mes).then(
      (painel) => {
        if (!cancelado) setEstado({ kind: 'pronto', painel });
      },
      (erro: unknown) => {
        if (cancelado) return;
        const sessao = erro instanceof ApiError && erro.status === 401;
        const mensagem =
          erro instanceof ApiError ? erro.body.message || erro.body.error : erro instanceof Error ? erro.message : 'Erro ao carregar.';
        setEstado({ kind: 'erro', mensagem, sessao });
      }
    );
    return () => {
      cancelado = true;
    };
  }, [mes, versao, carregar]);

  const irPara = (novo: string) => {
    setEstado({ kind: 'carregando' });
    setMes(novo);
  };
  const recarregar = () => {
    setEstado({ kind: 'carregando' });
    setVersao((v) => v + 1);
  };

  return (
    <div className="min-h-[100svh] bg-bone pb-20">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <a
          href="https://femme-vita-hub.vercel.app/master"
          className="font-mono text-[11px] tracking-wider uppercase text-navy/60 transition hover:text-navy"
        >
          ← Hub
        </a>
        <Logo variant="dark" size="sm" />
      </header>

      <main className="mx-auto max-w-3xl px-5">
        <p className="mt-8 font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">
          Faturamento SADT · MedSênior
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-4xl italic leading-[0.95] text-navy first-letter:uppercase sm:text-6xl">
            {rotuloMes(mes)}
          </h1>
          <div className="flex shrink-0 gap-2 pb-1">
            <BotaoMes rotulo="Mês anterior" onClick={() => irPara(deslocarMes(mes, -1))}>‹</BotaoMes>
            <BotaoMes rotulo="Próximo mês" onClick={() => irPara(deslocarMes(mes, 1))}>›</BotaoMes>
          </div>
        </div>

        {estado.kind === 'carregando' && <Carregando />}
        {estado.kind === 'erro' && <Erro mensagem={estado.mensagem} sessao={estado.sessao} onTentar={recarregar} />}
        {estado.kind === 'pronto' && <Conteudo painel={estado.painel} onRecarregar={recarregar} />}
      </main>
    </div>
  );
}

function Conteudo({ painel, onRecarregar }: { painel: PainelSadt; onRecarregar: () => void }) {
  const { totais } = painel;
  const vazio = painel.guias.length === 0 && painel.pdfsSemRegistro.length === 0;
  const dataNaAgenda = new Map(painel.agenda.disponivel ? painel.agenda.dataDiferente.map((d) => [d.chave, d.dataAgenda]) : []);

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy/10 bg-navy/10 shadow-soft sm:grid-cols-4 animate-slide-in">
        <Total rotulo="Digitalizadas" valor={totais.digitalizadas} />
        <Total rotulo="Faturadas" valor={totais.faturadas} extra={formatarMoeda(totais.valorFaturado)} tom="text-success" />
        <Total rotulo="Falta faturar" valor={totais.faltaFaturar} />
        <Total rotulo="Pedem atenção" valor={totais.atencao} tom={totais.atencao > 0 ? 'text-danger' : undefined} />
      </dl>

      <ConferenciaAgenda agenda={painel.agenda} />

      {!vazio && <Regua mes={painel.mes} guias={painel.guias} />}

      {painel.avisoLivro && (
        <p className="mt-6 rounded-2xl border border-danger/30 bg-danger/8 p-4 font-serif text-base italic leading-snug text-navy">
          {painel.avisoLivro}
        </p>
      )}

      {vazio && (
        <p className="mt-12 text-center font-serif text-2xl italic text-navy/50">
          Nenhuma guia SADT digitalizada em {rotuloMes(painel.mes)}.
        </p>
      )}

      {painel.pdfsSemRegistro.length > 0 && (
        <section className="mt-10 animate-slide-in">
          <CabecalhoSecao ponto="bg-danger" texto="text-danger" rotulo="PDF sem registro" quantidade={painel.pdfsSemRegistro.length}>
            O PDF está na pasta da paciente, mas o registro do faturamento não foi gravado. O robô não vê esta guia.
          </CabecalhoSecao>
          <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
            {painel.pdfsSemRegistro.map((pdf) => (
              <li key={pdf.id} className="flex items-baseline justify-between gap-3 border-t border-navy/8 py-3 first:border-t-0">
                <span className="min-w-0 truncate font-mono text-[12px] text-navy">{pdf.nome}</span>
                {pdf.link && <LinkPdf href={pdf.link} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ORDEM.map((status, i) => {
        const guias = painel.guias.filter((g) => g.status === status);
        if (guias.length === 0) return null;
        const estilo = ESTILO[status];
        return (
          <section key={status} className="mt-10 animate-slide-in" style={{ animationDelay: `${80 * (i + 1)}ms` }}>
            <CabecalhoSecao ponto={estilo.ponto} texto={estilo.texto} rotulo={estilo.rotulo} quantidade={guias.length}>
              {estilo.explica}
            </CabecalhoSecao>
            <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
              {guias.map((guia) => (
                <LinhaGuia key={guia.chave} guia={guia} dataAgenda={dataNaAgenda.get(guia.chave)} />
              ))}
            </ul>
          </section>
        );
      })}

      <Robo painel={painel} onRecarregar={onRecarregar} />
    </>
  );
}

/** Placar contra a agenda do Apolo e o que falta para fechar 100% do mês. */
function ConferenciaAgenda({ agenda }: { agenda: AgendaPainel }) {
  if (!agenda.disponivel) {
    return (
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-navy/45">
        Conferência com a agenda do Apolo indisponível: {agenda.motivo}.
      </p>
    );
  }
  const completo = agendaCompleta(agenda);
  return (
    <>
      <section
        aria-label="Conferência com a agenda do Apolo"
        className={`mt-4 rounded-2xl border p-4 shadow-soft animate-slide-in ${completo ? 'border-success/40 bg-success/8' : 'border-navy/10 bg-bone-50'}`}
      >
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy/45">Agenda do Apolo</p>
        <p className={`mt-1 font-serif text-xl leading-snug ${completo ? 'text-success' : 'text-navy'}`}>
          {agenda.atendidas} atendida{agenda.atendidas === 1 ? '' : 's'} · digitalizadas {agenda.digitalizadas} de {agenda.atendidas} · faturadas {agenda.faturadas} de {agenda.atendidas}
        </p>
        {completo && <p className="mt-1 text-[13px] text-success">Mês completo: todo atendimento MedSênior tem guia faturada.</p>}
      </section>

      <ListaAgenda
        rotulo="Atendida sem guia"
        ponto="bg-danger"
        texto="text-danger"
        explica="Atendimento MedSênior com baixa no Apolo e nenhuma guia digitalizada. Digitalize a guia desta paciente."
        linhas={agenda.semGuia.map((a, i) => ({ chave: `${a.paciente}-${a.data}-${i}`, data: a.data, nome: a.paciente, detalhe: a.servico ?? '' }))}
      />
      <ListaAgenda
        rotulo="Sem baixa no Apolo"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Consulta MedSênior que já passou e continua agendada ou confirmada. Dê baixa (atendida ou falta) no Apolo."
        linhas={agenda.semBaixa.map((a, i) => ({ chave: `${a.paciente}-${a.data}-${i}`, data: a.data, nome: a.paciente, detalhe: [a.status, a.servico].filter(Boolean).join(' · ') }))}
      />
      <ListaAgenda
        rotulo="Guia sem atendimento na agenda"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Guia digitalizada sem consulta atendida da paciente perto dessa data no Apolo. Confira a data da guia ou a agenda."
        linhas={agenda.guiaSemAtendimento.map((g) => ({ chave: g.chave, data: g.data, nome: g.paciente, detalhe: '' }))}
      />
      <ListaAgenda
        rotulo="Convênio errado no Apolo"
        ponto="bg-amber"
        texto="text-amber-600"
        explica="Tem guia MedSênior, mas no Apolo a consulta está com outro convênio ou sem convênio. Corrija o cadastro da consulta."
        linhas={agenda.convenioErrado.map((a, i) => ({ chave: `${a.paciente}-${a.data}-${i}`, data: a.data, nome: a.paciente, detalhe: a.convenio ?? 'sem convênio' }))}
      />
    </>
  );
}

function ListaAgenda({
  rotulo,
  ponto,
  texto,
  explica,
  linhas,
}: {
  rotulo: string;
  ponto: string;
  texto: string;
  explica: string;
  linhas: { chave: string; data: string | null; nome: string; detalhe: string }[];
}) {
  if (linhas.length === 0) return null;
  return (
    <section className="mt-10 animate-slide-in">
      <CabecalhoSecao ponto={ponto} texto={texto} rotulo={rotulo} quantidade={linhas.length}>
        {explica}
      </CabecalhoSecao>
      <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
        {linhas.map((l) => (
          <li key={l.chave} className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
            <span className="font-mono text-[12px] tabular-nums text-navy/50">{l.data ? diaMes(l.data) : '—'}</span>
            <div className="min-w-0">
              <p className="truncate font-serif text-lg leading-snug text-navy">{l.nome}</p>
              {l.detalhe && <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{l.detalhe}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Um ponto por guia, no dia da consulta. Mês inteiro verde = mês faturado. */
function Regua({ mes, guias }: { mes: string; guias: GuiaPainel[] }) {
  const dias = diasDoMes(mes);
  const porDia = guiasPorDia(guias);
  return (
    <figure className="mt-6 rounded-2xl border border-navy/8 bg-bone-50 p-4 shadow-soft animate-slide-in" style={{ animationDelay: '60ms' }}>
      <figcaption className="sr-only">Guias por dia da consulta</figcaption>
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-y-4 sm:grid-cols-[repeat(31,minmax(0,1fr))]">
        {Array.from({ length: dias }, (_, i) => {
          const dia = i + 1;
          const doDia = (porDia.get(dia) ?? []).slice().sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status));
          const domingo = diaDaSemana(mes, dia) === 0;
          return (
            <div key={dia} className="flex flex-col items-center gap-1.5" title={`${dia}: ${doDia.length} guia(s)`}>
              <div className="flex h-12 flex-col-reverse items-center gap-1">
                {doDia.slice(0, 4).map((g) => (
                  <span key={g.chave} className={`h-2 w-2 rounded-full ${ESTILO[g.status].ponto}`} />
                ))}
                {doDia.length > 4 && <span className="font-mono text-[8px] leading-none text-navy/50">+{doDia.length - 4}</span>}
              </div>
              <span className={`font-mono text-[9px] tabular-nums ${domingo ? 'text-navy/25' : 'text-navy/50'}`}>{dia}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function LinhaGuia({ guia, dataAgenda }: { guia: GuiaPainel; dataAgenda?: string }) {
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
      <span className="font-mono text-[12px] tabular-nums text-navy/50">
        {guia.data ? diaMes(guia.data) : '—'}
      </span>
      <div className="min-w-0">
        <p className="truncate font-serif text-lg leading-snug text-navy">{guia.paciente}</p>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaGuia(guia)}</p>
        {dataAgenda && (
          <p className="mt-0.5 text-[13px] leading-snug text-amber-600">
            Na agenda do Apolo a consulta é de {diaMes(dataAgenda)}: confira a data da guia.
          </p>
        )}
      </div>
      {guia.pdfId ? <LinkPdf href={`https://drive.google.com/file/d/${guia.pdfId}/view`} /> : <span />}
    </li>
  );
}

function LinkPdf({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 font-mono text-[10px] tracking-wider uppercase text-cyan-600 underline decoration-cyan-600/30 underline-offset-4"
    >
      PDF ↗
    </a>
  );
}

function Robo({ painel, onRecarregar }: { painel: PainelSadt; onRecarregar: () => void }) {
  const ultima = painel.ultimaExecucao;
  return (
    <section className="mt-12 overflow-hidden rounded-2xl bg-navy-deep text-bone shadow-lifted">
      <div className="border-b border-bone/10 px-5 py-5">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-amber">Robô</p>
        <p className="mt-1 font-serif text-2xl italic leading-tight">Faturar no computador do Daniel</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone/60">
          Na pasta <span className="font-mono text-bone/80">femme-vita-faturamento</span>, rode primeiro o ensaio: ele
          preenche e confere cada guia sem salvar. Se tudo vier ok, rode o de verdade.
        </p>
      </div>
      <Comando rotulo="Ensaio" texto={comandoRobo(painel.mes, true)} />
      <Comando rotulo="Faturar" texto={comandoRobo(painel.mes, false)} />
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-bone/50">
          {ultima
            ? `Última execução${ultima.dryRun ? ' (ensaio)' : ''}: ${new Date(ultima.inicio).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })} · ${ultima.resumo}`
            : 'O robô ainda não rodou neste mês.'}
        </p>
        <button
          onClick={onRecarregar}
          className="shrink-0 rounded-full border border-bone/20 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone/80 transition hover:border-bone/50 active:scale-95"
        >
          Atualizar
        </button>
      </div>
    </section>
  );
}
