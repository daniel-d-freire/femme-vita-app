// src/components/PainelAnexosScreen.tsx
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { BotaoMes, Carregando, CabecalhoSecao, Comando, Erro, Total } from './painel-parts';
import { ApiError } from '../lib/api';
import {
  buscarPainelAnexos,
  comandoAnexos,
  comandoReenvio,
  detalheDaConta,
  mesAtual,
  type ContaPainel,
  type PainelAnexos,
  type StatusConta,
} from '../lib/anexos';
import { deslocarMes, rotuloMes } from '../lib/painel';

type Estado =
  | { kind: 'carregando' }
  | { kind: 'pronto'; painel: PainelAnexos }
  | { kind: 'erro'; mensagem: string; sessao: boolean };

/** Primeiro o que pede ação humana; por último o que já está resolvido. */
const ORDEM: StatusConta[] = ['conferir', 'pendencia', 'nao_enviada', 'anexada'];

const ESTILO: Record<StatusConta, { rotulo: string; ponto: string; texto: string; explica: string }> = {
  conferir: {
    rotulo: 'Conferir no portal',
    ponto: 'bg-amber',
    texto: 'text-amber-600',
    explica: 'O robô clicou em Processar e não viu a confirmação. Confira no portal se o anexo está lá; só reenvie se NÃO estiver.',
  },
  pendencia: {
    rotulo: 'Pendências',
    ponto: 'bg-danger',
    texto: 'text-danger',
    explica: 'Nada foi enviado. Resolva o motivo (digitalizar, renomear, conferir a pasta) e rode o robô de novo.',
  },
  nao_enviada: {
    rotulo: 'Ainda não enviadas',
    ponto: 'bg-navy',
    texto: 'text-navy',
    explica: 'O robô viu estas contas no portal e ainda não mexeu nelas.',
  },
  anexada: {
    rotulo: 'Anexadas',
    ponto: 'bg-success',
    texto: 'text-success',
    explica: 'O portal confirmou o anexo.',
  },
};

type Props = {
  /** Injetável para a vitrine de desenvolvimento. */
  carregar?: (mes: string) => Promise<PainelAnexos>;
  mesInicial?: string;
};

export function PainelAnexosScreen({ carregar = buscarPainelAnexos, mesInicial }: Props) {
  const [mes, setMes] = useState(() => mesInicial ?? mesAtual(new Date()));
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
        <p className="mt-8 font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">Anexos de conta · MedSênior</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-4xl italic leading-[0.95] text-navy first-letter:uppercase sm:text-6xl">{rotuloMes(mes)}</h1>
          <div className="flex shrink-0 gap-2 pb-1">
            <BotaoMes rotulo="Mês anterior" onClick={() => irPara(deslocarMes(mes, -1))}>‹</BotaoMes>
            <BotaoMes rotulo="Próximo mês" onClick={() => irPara(deslocarMes(mes, 1))}>›</BotaoMes>
          </div>
        </div>
        <p className="mt-2 font-mono text-[11px] text-navy/45">Referência {mes.slice(5, 7)}/{mes.slice(0, 4)} no portal MedSênior</p>

        {estado.kind === 'carregando' && <Carregando />}
        {estado.kind === 'erro' && <Erro mensagem={estado.mensagem} sessao={estado.sessao} onTentar={recarregar} />}
        {estado.kind === 'pronto' && <Conteudo painel={estado.painel} onRecarregar={recarregar} />}
      </main>
    </div>
  );
}

function Conteudo({ painel, onRecarregar }: { painel: PainelAnexos; onRecarregar: () => void }) {
  const { totais } = painel;
  const atencao = totais.conferir + totais.pendencias;
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy/10 bg-navy/10 shadow-soft sm:grid-cols-4 animate-slide-in">
        <Total rotulo="Contas" valor={totais.total} />
        <Total rotulo="Anexadas" valor={totais.anexadas} tom="text-success" />
        <Total rotulo="Não enviadas" valor={totais.naoEnviadas} />
        <Total rotulo="Pedem atenção" valor={atencao} tom={atencao > 0 ? 'text-danger' : undefined} />
      </dl>

      {painel.aviso && (
        <p className="mt-6 rounded-2xl border border-danger/30 bg-danger/8 p-4 font-serif text-base italic leading-snug text-navy">
          {painel.aviso}
        </p>
      )}

      {!painel.aviso && painel.contas.length === 0 && (
        <p className="mt-12 text-center font-serif text-2xl italic text-navy/50">
          O robô ainda não rodou na Referência {painel.referencia}.
        </p>
      )}

      {ORDEM.map((status, i) => {
        const contas = painel.contas.filter((c) => c.status === status);
        if (contas.length === 0) return null;
        const estilo = ESTILO[status];
        return (
          <section key={status} className="mt-10 animate-slide-in" style={{ animationDelay: `${80 * (i + 1)}ms` }}>
            <CabecalhoSecao ponto={estilo.ponto} texto={estilo.texto} rotulo={estilo.rotulo} quantidade={contas.length}>
              {estilo.explica}
            </CabecalhoSecao>
            <ul className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 px-4 shadow-soft">
              {contas.map((c) => (
                <LinhaConta key={c.conta} conta={c} mes={painel.mes} />
              ))}
            </ul>
          </section>
        );
      })}

      <Robo painel={painel} onRecarregar={onRecarregar} />
    </>
  );
}

function LinhaConta({ conta, mes }: { conta: ContaPainel; mes: string }) {
  return (
    <li className="border-t border-navy/8 py-3 first:border-t-0">
      <p className="truncate font-serif text-lg leading-snug text-navy">{conta.paciente}</p>
      <p className="mt-0.5 break-words text-[13px] leading-snug text-navy/60">{detalheDaConta(conta)}</p>
      {conta.nota && <p className="mt-0.5 text-[12px] leading-snug text-navy/45">{conta.nota}</p>}
      {conta.status === 'conferir' && (
        <p className="mt-1 break-all font-mono text-[11px] leading-snug text-amber-600">
          Se NÃO estiver no portal: {comandoReenvio(mes, conta.conta)}
        </p>
      )}
    </li>
  );
}

function Robo({ painel, onRecarregar }: { painel: PainelAnexos; onRecarregar: () => void }) {
  const ultima = painel.ultimaExecucao;
  return (
    <section className="mt-12 overflow-hidden rounded-2xl bg-navy-deep text-bone shadow-lifted">
      <div className="border-b border-bone/10 px-5 py-5">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-amber">Robô</p>
        <p className="mt-1 font-serif text-2xl italic leading-tight">Anexar no computador do Daniel</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone/60">
          Na pasta <span className="font-mono text-bone/80">femme-vita-faturamento</span>, rode primeiro o ensaio: ele escolhe os
          documentos de cada conta sem anexar nada. Se o plano estiver certo, rode o de verdade.
        </p>
      </div>
      <Comando rotulo="Ensaio" texto={comandoAnexos(painel.mes, true)} />
      <Comando rotulo="Anexar" texto={comandoAnexos(painel.mes, false)} />
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-bone/50">
          {ultima
            ? `Última execução${ultima.dryRun ? ' (ensaio)' : ''}: ${new Date(ultima.inicio).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })} · ${ultima.resumo}`
            : 'O robô ainda não rodou nesta Referência.'}
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
