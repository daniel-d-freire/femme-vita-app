// src/components/painel-parts.tsx — peças comuns aos painéis (SADT, Anexos)
import { useState, type ReactNode } from 'react';
import { guardarDestino } from '../lib/destino';

export function BotaoMes({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
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

export function Total({ rotulo, valor, extra, tom }: { rotulo: string; valor: number; extra?: string; tom?: string }) {
  return (
    <div className="bg-bone-50 p-4">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy/45">{rotulo}</dt>
      <dd className={`mt-1 font-mono text-3xl tabular-nums leading-none ${tom ?? 'text-navy'}`}>{valor}</dd>
      {extra && <dd className="mt-1.5 font-mono text-[11px] tabular-nums text-navy/50">{extra}</dd>}
    </div>
  );
}

export function CabecalhoSecao({
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

export function Comando({ rotulo, texto }: { rotulo: string; texto: string }) {
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

export function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Carregando o mês">
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-24 animate-pulse rounded-2xl bg-navy/5" />
      <div className="h-40 animate-pulse rounded-2xl bg-navy/5" />
    </div>
  );
}

export function Erro({ mensagem, sessao, onTentar }: { mensagem: string; sessao: boolean; onTentar: () => void }) {
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
