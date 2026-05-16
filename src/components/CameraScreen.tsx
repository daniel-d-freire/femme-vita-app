import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { captureFrame, startCamera, stopCamera, type CameraStreamHandle, type CapturedPage } from '../lib/camera';

type Props = {
  pages: CapturedPage[];
  onCapture: (page: CapturedPage) => void;
  onReview: () => void;
};

type CameraState =
  | { kind: 'starting' }
  | { kind: 'ready' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

export function CameraScreen({ pages, onCapture, onReview }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<CameraStreamHandle | null>(null);
  const [state, setState] = useState<CameraState>({ kind: 'starting' });
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await startCamera('environment');
        if (cancelled) {
          stopCamera(handle);
          return;
        }
        handleRef.current = handle;
        if (videoRef.current) {
          videoRef.current.srcObject = handle.stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState({ kind: 'ready' });
      } catch (err) {
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setState({ kind: 'denied' });
        } else {
          setState({ kind: 'error', message: e.message || 'Erro ao iniciar câmera.' });
        }
      }
    })();
    return () => {
      cancelled = true;
      stopCamera(handleRef.current);
      handleRef.current = null;
    };
  }, []);

  const onShutter = useCallback(async () => {
    if (state.kind !== 'ready' || !videoRef.current || capturing) return;
    setCapturing(true);
    setFlash(true);
    try {
      const page = await captureFrame(videoRef.current);
      onCapture(page);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setFlash(false), 280);
      setTimeout(() => setCapturing(false), 320);
    }
  }, [state, capturing, onCapture]);

  const lastPage = pages[pages.length - 1];

  return (
    <div className="relative flex h-[100svh] w-full flex-col bg-navy-deep overflow-hidden">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Logo variant="light" size="sm" />
        <div className="font-mono text-[11px] tracking-wider text-bone/60 uppercase">
          {pages.length > 0 ? (
            <span><span className="text-amber">{String(pages.length).padStart(2, '0')}</span> / página{pages.length === 1 ? '' : 's'}</span>
          ) : (
            <span>Pronto</span>
          )}
        </div>
      </header>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* A4 frame guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[78%] w-[88%] max-w-[480px] rounded-[2px]">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            {state.kind === 'ready' && pages.length === 0 && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="font-serif text-2xl italic text-bone/85">Enquadre o documento</p>
                <p className="mt-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-bone/40">Mantenha estável</p>
              </div>
            )}
          </div>
        </div>

        {/* Flash */}
        {flash && <div className="pointer-events-none absolute inset-0 z-10 bg-bone animate-flash" />}

        {/* Loading / Error states */}
        {state.kind !== 'ready' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-deep/95 backdrop-blur-sm">
            <div className="max-w-xs px-6 text-center">
              {state.kind === 'starting' && (
                <>
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-bone/20 border-t-amber" />
                  <p className="font-serif text-2xl italic text-bone">iniciando câmera</p>
                </>
              )}
              {state.kind === 'denied' && (
                <>
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-danger/20 flex items-center justify-center">
                    <span className="text-danger text-2xl">⊘</span>
                  </div>
                  <p className="font-serif text-xl text-bone mb-2">Permissão de câmera negada</p>
                  <p className="text-sm text-bone/60">Permita o acesso nas configurações do navegador e recarregue a página.</p>
                </>
              )}
              {state.kind === 'error' && (
                <>
                  <p className="font-serif text-xl text-bone mb-2">Algo deu errado</p>
                  <p className="text-sm text-bone/60">{state.message}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer with controls */}
      <footer className="relative z-20 grid grid-cols-3 items-center gap-4 px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {/* Last page thumb (tap to review) */}
        <div className="flex justify-start">
          {lastPage ? (
            <button
              onClick={onReview}
              className="group relative h-14 w-14 overflow-hidden rounded-xl border border-bone/20 bg-navy ring-0 transition active:scale-95"
              aria-label={`Revisar ${pages.length} página${pages.length === 1 ? '' : 's'}`}
            >
              <img src={lastPage.dataUrl} alt="" className="h-full w-full object-cover" />
              {pages.length > 1 && (
                <span className="absolute right-1 top-1 rounded-md bg-navy-deep/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-bone">
                  +{pages.length - 1}
                </span>
              )}
            </button>
          ) : (
            <div className="h-14 w-14 rounded-xl border border-dashed border-bone/15" />
          )}
        </div>

        {/* Shutter */}
        <div className="flex justify-center">
          <button
            onClick={onShutter}
            disabled={state.kind !== 'ready' || capturing}
            className="group relative grid h-[78px] w-[78px] place-items-center rounded-full bg-amber shadow-amber transition active:scale-[0.92] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Tirar foto"
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
