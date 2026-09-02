import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { Logo } from './Logo';
import { loadPhotoFile, type CapturedPage } from '../lib/camera';
import type { AuthUser } from '../lib/api';

type Props = {
  pages: CapturedPage[];
  onCapture: (page: CapturedPage) => void;
  onReview: () => void;
  user: AuthUser;
  folderCount: number | null;
  foldersError?: string;
  onLogout: () => void;
};

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

const TIPS = ['luz uniforme, sem flash', 'folha inteira dentro do quadro', 'sem sombra da mão'];

export function CameraScreen({ pages, onCapture, onReview, user, folderCount, foldersError, onLogout }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CaptureState>({ kind: 'idle' });
  const [showMenu, setShowMenu] = useState(false);

  const onFileChosen = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // Permite escolher o mesmo arquivo de novo.
    input.value = '';
    if (!file) return;
    setState({ kind: 'loading' });
    try {
      const page = await loadPhotoFile(file);
      console.log(`[femme-vita] foto ${file.type} → ${page.width}×${page.height}`);
      setState({ kind: 'idle' });
      onCapture(page);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao ler a foto.';
      setState({ kind: 'error', message });
    }
  }, [onCapture]);

  const openCamera = useCallback(() => {
    if (state.kind === 'loading') return;
    cameraInputRef.current?.click();
  }, [state.kind]);

  const openGallery = useCallback(() => {
    if (state.kind === 'loading') return;
    galleryInputRef.current?.click();
  }, [state.kind]);

  const lastPage = pages[pages.length - 1];
  const initial = (user.name?.[0] || user.email[0] || '?').toUpperCase();
  const isLoading = state.kind === 'loading';

  return (
    <div className="relative flex h-[100svh] w-full flex-col bg-navy-deep overflow-hidden">
      {/* Inputs ocultos: câmera nativa (capture) e galeria. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChosen}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />

      {/* Header */}
      <header className="relative z-20 flex items-start justify-between px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Logo variant="light" size="sm" />
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-bone/10 px-2 py-1 backdrop-blur-sm transition active:scale-95"
            aria-label="Menu da conta"
          >
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-full bg-amber font-mono text-xs font-semibold text-navy-deep">
                {initial}
              </div>
            )}
          </button>
          <div className="text-right font-mono text-[10px] tracking-wider uppercase text-bone/50">
            {folderCount !== null ? (
              <span><span className="text-amber">{folderCount}</span> pacientes</span>
            ) : foldersError ? (
              <span className="text-danger">Apolo não encontrada</span>
            ) : (
              <span>carregando…</span>
            )}
          </div>
        </div>
      </header>

      {/* Account menu */}
      {showMenu && (
        <div className="absolute right-5 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 w-64 origin-top-right rounded-2xl border border-bone/10 bg-navy/95 p-4 shadow-lifted backdrop-blur-lg animate-slide-down">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-bone/40">Conta</p>
          <p className="mt-1.5 font-serif text-lg text-bone truncate">{user.name || user.email}</p>
          <p className="font-mono text-[11px] text-bone/50 truncate">{user.email}</p>
          {foldersError && (
            <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-2 text-[11px] leading-snug text-bone/90">
              {foldersError}
            </p>
          )}
          <button
            onClick={() => { setShowMenu(false); onLogout(); }}
            className="mt-4 flex w-full items-center justify-center rounded-xl border border-bone/15 bg-bone/5 px-3 py-2.5 font-mono text-[11px] tracking-wider uppercase text-bone transition active:scale-[0.98]"
          >
            Sair
          </button>
        </div>
      )}

      {/* Bancada: moldura A4 com orientação */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
        <button
          onClick={openCamera}
          disabled={isLoading}
          className="relative aspect-[210/297] h-[78%] max-h-[560px] w-auto max-w-[88%] rounded-[2px] text-left transition active:scale-[0.99] disabled:cursor-wait"
          aria-label="Fotografar documento"
        >
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />

          {/* Sugestão de formulário: barras que lembram os campos de uma guia */}
          <div className="pointer-events-none absolute inset-x-[14%] top-[12%] flex flex-col gap-2.5" aria-hidden>
            <div className="h-2 w-2/3 rounded-full bg-bone/10" />
            <div className="h-2 w-full rounded-full bg-bone/[0.07]" />
            <div className="h-2 w-5/6 rounded-full bg-bone/[0.07]" />
            <div className="h-2 w-1/2 rounded-full bg-bone/[0.07]" />
          </div>

          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
            {state.kind === 'error' ? (
              <>
                <p className="font-serif text-2xl italic text-danger">Não consegui ler a foto</p>
                <p className="mt-2 text-sm text-bone/60">{state.message}</p>
                <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-bone/40">toque para tentar de novo</p>
              </>
            ) : (
              <>
                <p className="font-serif text-2xl italic text-bone/90">
                  {pages.length === 0 ? 'Fotografe a guia' : `Página ${pages.length + 1}`}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {TIPS.map((tip) => (
                    <li key={tip} className="font-mono text-[10px] tracking-[0.16em] uppercase text-bone/40">
                      {tip}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[2px] bg-navy-deep/85 backdrop-blur-sm">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-bone/20 border-t-amber" />
                <p className="font-serif text-xl italic text-bone">lendo a foto</p>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Galeria */}
      <div className="relative z-20 flex justify-center pb-2">
        <button
          onClick={openGallery}
          disabled={isLoading}
          className="rounded-full px-4 py-2 font-mono text-[10px] tracking-[0.18em] uppercase text-bone/50 transition active:scale-95 hover:text-bone disabled:opacity-40"
        >
          ou escolher da galeria
        </button>
      </div>

      {/* Footer with controls */}
      <footer className="relative z-20 grid grid-cols-3 items-center gap-4 px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {/* Last page thumb (tap to review) */}
        <div className="flex justify-start">
          {lastPage ? (
            <button
              onClick={onReview}
              className="group relative h-14 w-14 overflow-hidden rounded-xl border border-bone/20 bg-navy ring-0 transition active:scale-95"
              aria-label={`Revisar ${pages.length} página${pages.length === 1 ? '' : 's'}`}
            >
              <img src={lastPage.dataUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute right-1 top-1 rounded-md bg-navy-deep/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-bone">
                {pages.length}
              </span>
            </button>
          ) : (
            <div className="h-14 w-14 rounded-xl border border-dashed border-bone/15" />
          )}
        </div>

        {/* Shutter → câmera nativa */}
        <div className="flex justify-center">
          <button
            onClick={openCamera}
            disabled={isLoading}
            className="group relative grid h-[78px] w-[78px] place-items-center rounded-full bg-amber shadow-amber transition active:scale-[0.92] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Abrir câmera"
          >
            <span className="absolute inset-0 rounded-full ring-2 ring-bone/40" />
            <span className="absolute inset-1.5 rounded-full ring-1 ring-navy-deep/30" />
            <span className="h-[58px] w-[58px] rounded-full bg-amber transition group-active:scale-90 group-active:bg-amber-600" />
          </button>
        </div>

        {/* Finalize */}
        <div className="flex justify-end">
          <button
            onClick={onReview}
            disabled={pages.length === 0}
            className="rounded-full bg-bone px-4 py-3 font-mono text-[11px] tracking-wider uppercase text-navy shadow-soft transition active:scale-95 disabled:opacity-30 disabled:bg-bone/30 disabled:text-bone disabled:shadow-none"
          >
            Finalizar →
          </button>
        </div>
      </footer>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const map: Record<string, string> = {
    tl: 'top-0 left-0 border-t-2 border-l-2 rounded-tl-md',
    tr: 'top-0 right-0 border-t-2 border-r-2 rounded-tr-md',
    bl: 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md',
    br: 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-md',
  };
  return <span className={`absolute h-7 w-7 border-bone/70 ${map[pos]}`} aria-hidden />;
}
