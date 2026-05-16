import { useState } from 'react';
import { Logo } from './Logo';
import { formatBytes, type CapturedPage } from '../lib/camera';

type Props = {
  pages: CapturedPage[];
  onAddPage: () => void;
  onRemovePage: (id: string) => void;
  onSubmit: () => void;
};

export function PagesStack({ pages, onAddPage, onRemovePage, onSubmit }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const totalBytes = pages.reduce((sum, p) => sum + p.bytes, 0);

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      {/* Header */}
      <header className="relative z-10 border-b border-navy/8 bg-bone/80 px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4 backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={onAddPage}
            className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-navy/70 transition active:scale-95 active:text-navy"
          >
            ← Câmera
          </button>
          <Logo variant="dark" size="sm" />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Pré-visualização</p>
            <h1 className="mt-1 font-serif text-3xl italic leading-none text-navy">
              {pages.length} <span className="text-navy/60">página{pages.length === 1 ? '' : 's'}</span>
            </h1>
          </div>
          <p className="font-mono text-[11px] text-navy/50">~{formatBytes(totalBytes)}</p>
        </div>
      </header>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-32">
        {pages.length === 0 ? (
          <div className="grid place-items-center py-24 text-center">
            <p className="font-serif text-2xl italic text-navy/40">Nenhuma página ainda</p>
            <p className="mt-2 text-sm text-navy/40">Volte para a câmera para começar.</p>
          </div>
        ) : (
          <ol className="grid grid-cols-2 gap-3">
            {pages.map((page, idx) => (
              <li
                key={page.id}
                className="group relative animate-slide-in overflow-hidden rounded-2xl bg-navy shadow-soft"
                style={{ aspectRatio: '3 / 4' }}
              >
                <img
                  src={page.dataUrl}
                  alt={`Página ${idx + 1}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Page number */}
                <div className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-md bg-navy-deep/85 px-2 font-mono text-[11px] font-medium text-bone backdrop-blur-sm">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                {/* Delete */}
                {confirming === page.id ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-navy-deep/85 backdrop-blur-sm">
                    <div className="px-4 text-center">
                      <p className="mb-3 font-serif text-base italic text-bone">Remover esta página?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirming(null)}
                          className="flex-1 rounded-md border border-bone/30 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone/80"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => {
                            onRemovePage(page.id);
                            setConfirming(null);
                          }}
                          className="flex-1 rounded-md bg-danger px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase text-bone"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(page.id)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-navy-deep/70 text-bone/80 backdrop-blur-sm transition hover:bg-danger/90 hover:text-bone active:scale-90"
                    aria-label={`Remover página ${idx + 1}`}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Footer actions */}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-navy/8 bg-bone/90 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onAddPage}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-navy/15 bg-bone-50 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-[0.98]"
          >
            <span className="text-xl leading-none">+</span> Adicionar página
          </button>
          <button
            onClick={onSubmit}
            disabled={pages.length === 0}
            className="flex h-14 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-navy font-mono text-[11px] tracking-wider uppercase text-bone shadow-lifted transition active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
          >
            Processar <span className="text-amber">→</span>
          </button>
        </div>
        <p className="mt-2 text-center font-mono text-[10px] tracking-wider uppercase text-navy/30">
          Claude vai ler nome + tipo da paciente
        </p>
      </footer>
    </div>
  );
}
