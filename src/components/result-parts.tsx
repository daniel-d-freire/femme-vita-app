// src/components/result-parts.tsx
// Peças compartilhadas pelas telas de resultado (Arquivo geral e Guias SADT).
import type { FolderMatch } from '../lib/folder-match';
import type { Destino, Manual } from '../lib/useDestino';

export function ConfidenceBadge({ tone, value }: { tone: 'high' | 'medium' | 'low'; value: number }) {
  const styles = {
    high: 'bg-success/15 text-success border-success/30',
    medium: 'bg-amber/15 text-amber-600 border-amber/30',
    low: 'bg-danger/15 text-danger border-danger/30',
  }[tone];
  const label = { high: 'Alta', medium: 'Média', low: 'Baixa' }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${styles}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {label} · {(value * 100).toFixed(0)}%
    </span>
  );
}

export function MatchBadge({ confidence, method }: { confidence: number; method: string }) {
  const isExact = confidence === 1.0;
  const styles = isExact
    ? 'bg-success/15 text-success border-success/30'
    : 'bg-amber/15 text-amber-600 border-amber/30';
  const label = isExact ? 'Exato' : method === 'levenshtein' ? 'Aprox.' : 'Parcial';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${styles}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {label} · {(confidence * 100).toFixed(0)}%
    </span>
  );
}

export function PencilIcon() {
  return (
    <span className="mt-2 grid h-7 w-7 flex-none place-items-center rounded-md bg-navy/8 text-navy/50">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m14.121 15.536-2.121 2.121a4 4 0 0 1-5.657-5.657l3.536-3.536" /><path d="M3 21h6l11-11a2.121 2.121 0 0 0-3-3L6 18v3z" />
      </svg>
    </span>
  );
}

export function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 12a9 9 0 1 1-9-9c2.34 0 4.5.91 6.13 2.4" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export function BannerErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="mt-3 rounded-2xl border border-danger/30 bg-danger/8 p-4">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">Atenção</p>
      <p className="mt-1.5 font-serif text-base italic leading-snug text-navy">{mensagem}</p>
    </div>
  );
}

export function CartaoDestino({
  destination,
  autoMatch,
  manual,
  fileName,
  onTrocarPasta,
}: {
  destination: Destino;
  autoMatch: FolderMatch | null;
  manual: Manual | null;
  fileName: string | null;
  onTrocarPasta: () => void;
}) {
  return (
    <section className={`mt-3 overflow-hidden rounded-2xl border p-5 shadow-soft ${
      destination.kind === 'folder'
        ? autoMatch && !manual && autoMatch.confidence === 1.0
          ? 'border-success/30 bg-success/5'
          : 'border-amber/30 bg-amber/5'
        : 'border-cyan/30 bg-cyan/5'
    }`}>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Destino</p>
        {manual ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/15 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase text-amber-600">
            <span className="h-1 w-1 rounded-full bg-current" /> Manual
          </span>
        ) : autoMatch ? (
          <MatchBadge confidence={autoMatch.confidence} method={autoMatch.method} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/15 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase text-cyan-600">
            <span className="h-1 w-1 rounded-full bg-current" /> _Pendentes
          </span>
        )}
      </div>
      <div className="mt-2">
        {destination.kind === 'folder' ? (
          <p className="font-serif text-2xl italic text-navy break-words">{destination.folder.name}</p>
        ) : (
          <>
            <p className="font-serif text-xl italic text-navy/80 break-words">Pasta não encontrada</p>
            <p className="mt-1 font-mono text-[11px] text-navy/50">
              Vai pra <span className="text-cyan-600">_Pendentes / {destination.name}</span>
            </p>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-navy/8 pt-3">
        <button
          onClick={onTrocarPasta}
          className="font-mono text-[11px] tracking-wider uppercase text-navy/70 transition active:scale-95 active:text-navy"
        >
          ↻ Trocar pasta
        </button>
        {fileName && (
          <p className="ml-3 truncate font-mono text-[11px] text-navy/40">
            {fileName}
          </p>
        )}
      </div>
    </section>
  );
}

export function PreviewOrientacao({
  dataUrl,
  userRotation,
  effectiveRotation,
  onGirar,
}: {
  dataUrl: string;
  userRotation: number;
  effectiveRotation: number;
  onGirar: () => void;
}) {
  return (
    <section className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
          Pré-visualização {userRotation !== 0 && <span className="ml-1 text-amber-600">· ajustada</span>}
        </p>
        <p className="font-mono text-[10px] tracking-wide uppercase text-navy/40">
          {effectiveRotation}°
        </p>
      </div>
      <div className="mt-3 flex items-stretch gap-3">
        <div className="h-36 w-36 flex-none grid place-items-center overflow-hidden rounded-xl border border-navy/10 bg-bone">
          <img
            src={dataUrl}
            alt="prévia da página"
            style={{ transform: `rotate(${effectiveRotation}deg)` }}
            className="max-h-full max-w-full transition-transform duration-300 ease-out"
          />
        </div>
        <div className="flex flex-1 flex-col justify-between gap-2">
          <p className="font-serif text-sm italic leading-snug text-navy/70">
            Confira se o documento está em pé. Se não, gire.
          </p>
          <button
            onClick={onGirar}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-navy/15 bg-bone px-4 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-95"
          >
            <RotateIcon /> Girar 90°
          </button>
        </div>
      </div>
    </section>
  );
}
