import { Logo } from './Logo';
import type { UploadResponse } from '../lib/api';

type Props = {
  result: UploadResponse;
  onNewDocument: () => void;
};

export function SavedScreen({ result, onNewDocument }: Props) {
  const totalSec = (result.timing.totalMs / 1000).toFixed(1);

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      <header className="px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4">
        <Logo variant="dark" size="sm" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 -m-3 rounded-full bg-success/12 animate-pulse-glow" />
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-success text-bone shadow-lifted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <p className="mt-8 font-mono text-[10px] tracking-[0.28em] uppercase text-success">
          arquivado
        </p>
        <h1 className="mt-2 max-w-sm font-serif text-4xl italic leading-tight text-navy">
          {result.wasPendente ? 'em _Pendentes' : 'salvo na pasta'}
        </h1>

        <div className="mt-6 w-full max-w-sm rounded-2xl border border-navy/8 bg-bone-50 p-4 text-left shadow-soft">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Pasta</p>
          <p className="mt-1 font-serif text-xl italic text-navy break-words">{result.folderName}</p>

          <div className="mt-4 border-t border-navy/8 pt-3">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Arquivo</p>
            <p className="mt-1 font-mono text-[12px] text-navy break-all">{result.fileName}</p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-navy/8 pt-3">
            <span className="font-mono text-[10px] tracking-wider uppercase text-navy/50">
              {result.sizeKb} KB
            </span>
            <span className="font-mono text-[10px] tracking-wider uppercase text-navy/50">
              {totalSec}s
            </span>
          </div>
        </div>

        {result.webViewLink && (
          <a
            href={result.webViewLink}
            target="_blank"
            rel="noreferrer"
            className="mt-4 font-mono text-[11px] tracking-wider uppercase text-cyan-600 underline decoration-cyan-600/30 underline-offset-4"
          >
            Abrir no Drive ↗
          </a>
        )}

        {result.wasPendente && (
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-navy/50">
            Você pode mover o arquivo manualmente depois pela pasta certa da paciente no Drive.
          </p>
        )}
      </div>

      <footer className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <button
          onClick={onNewDocument}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-navy font-mono text-[11px] tracking-wider uppercase text-bone shadow-lifted transition active:scale-[0.98]"
        >
          Novo documento <span className="text-amber">→</span>
        </button>
      </footer>
    </div>
  );
}
