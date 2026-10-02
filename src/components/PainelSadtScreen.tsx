// src/components/PainelSadtScreen.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from './Logo';
import { ApiError } from '../lib/api';
import { guardarDestino } from '../lib/destino';
import {
  buscarPainel,
  comandoRobo,
  deslocarMes,
  diaDaSemana,
  diasDoMes,
  formatarMoeda,
  guiasPorDia,
  mesAnterior,
  rotuloMes,
  type GuiaPainel,
  type PainelSadt,
  type StatusPainel,
} from '../lib/painel';
import { isoParaDataBr } from '../lib/sadt';

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

function BotaoMes({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      className="grid h-11 w-11 place-items-center rounded-full border border-navy/15 bg-bone-50 font-serif text-2xl leading-none text-navy shadow-soft transition hover:border-navy/40 active:scale-95"
    >
      {children}
    </button>
  );
}

function Conteudo({ painel, onRecarregar }: { painel: PainelSadt; onRecarregar: () => void }) {
  const { totais } = painel;
  const vazio = painel.guias.length === 0 && painel.pdfsSemRegistro.length === 0;

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy/10 bg-navy/10 shadow-soft sm:grid-cols-4 animate-slide-in">
        <Total rotulo="Digitalizadas" valor={totais.digitalizadas} />
        <Total rotulo="Faturadas" valor={totais.faturadas} extra={formatarMoeda(totais.valorFaturado)} tom="text-success" />
        <Total rotulo="Falta faturar" valor={totais.faltaFaturar} />
        <Total rotulo="Pedem atenção" valor={totais.atencao} tom={totais.atencao > 0 ? 'text-danger' : undefined} />
      </dl>

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
                <LinhaGuia key={guia.chave} guia={guia} />
              ))}
            </ul>
          </section>
        );
      })}

      <Robo painel={painel} onRecarregar={onRecarregar} />
    </>
  );
}

function Total({ rotulo, valor, extra, tom }: { rotulo: string; valor: number; extra?: string; tom?: string }) {
  return (
    <div className="bg-bone-50 p-4">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy/45">{rotulo}</dt>
      <dd className={`mt-1 font-mono text-3xl tabular-nums leading-none ${tom ?? 'text-navy'}`}>{valor}</dd>
      {extra && <dd className="mt-1.5 font-mono text-[11px] tabular-nums text-navy/50">{extra}</dd>}
    </div>
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

function CabecalhoSecao({
  ponto,
  texto,
  rotulo,
  quantidade,
  children,
}: {
  ponto: string;
  texto: string;
  rotulo: string;
  quantidade: number;
  children: ReactNode;
}) {
  return (
    <header>
      <h2 className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] uppercase ${texto}`}>
        <span className={`h-2 w-2 rounded-full ${ponto}`} />
        {rotulo}
        <span className="text-navy/40">· {quantidade}</span>
      </h2>
      <p className="mt-1 font-serif text-[15px] italic leading-snug text-navy/60">{children}</p>
    </header>
  );
}

function detalheDaGuia(guia: GuiaPainel): string {
  if (guia.status === 'faturada') {
    return [guia.guiaPortal && `guia ${guia.guiaPortal}`, guia.valor !== null && formatarMoeda(guia.valor)]
      .filter(Boolean)
      .join(' · ');
  }
  if (guia.status === 'falta_faturar') {
    return guia.digitalizadoPor ? `digitalizada por ${guia.digitalizadoPor}` : 'digitalizada';
  }
  const prefixo = guia.guiaPortal ? `guia ${guia.guiaPortal} · ` : '';
  return `${prefixo}${guia.motivo ?? ''}`;
}

function LinhaGuia({ guia }: { guia: GuiaPainel }) {
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-navy/8 py-3 first:border-t-0">
      <span className="font-mono text-[12px] tabular-nums text-navy/50">
        {guia.data ? isoParaDataBr(guia.data).slice(0, 5) : '—'}
      </span>
      <div className="min-w-0">
        <p className="truncate font-serif text-lg leading-snug text-navy">{guia.paciente}</p>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaGuia(guia)}</p>
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

function Comando({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="flex items-center gap-3 border-b border-bone/10 px-5 py-3">
      <span className="w-14 shrink-0 font-mono text-[10px] tracking-wider uppercase text-bone/40">{rotulo}</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-bone">
        <span className="text-amber">$ </span>
        {texto}
      </code>
      <button
        onClick={copiar}
        className="shrink-0 rounded-full bg-bone/10 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone transition hover:bg-bone/20 active:scale-95"
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Carregando o mês">
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-40 animate-pulse rounded-2xl bg-navy/5" />
    </div>
  );
}

function Erro({ mensagem, sessao, onTentar }: { mensagem: string; sessao: boolean; onTentar: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-danger/30 bg-danger/8 p-5">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">
        {sessao ? 'Sessão expirada' : 'Não carregou'}
      </p>
      <p className="mt-1.5 font-serif text-lg italic leading-snug text-navy">{mensagem}</p>
      {sessao ? (
        <a
          href="/api/auth/google"
          onClick={() => guardarDestino(window.location.search)}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-navy px-4 font-mono text-[11px] tracking-wider uppercase text-bone"
        >
          Entrar de novo
        </a>
      ) : (
        <button
          onClick={onTentar}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-navy px-4 font-mono text-[11px] tracking-wider uppercase text-bone"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
