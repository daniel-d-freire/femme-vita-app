import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from './Logo';
import { estimateDataUrlBytes, loadImage, type CapturedPage } from '../lib/camera';
import {
  defaultCorners,
  detectPaperCorners,
  isOpenCVReady,
  loadOpenCV,
  rectifyAndFilter,
  type Corners,
  type FilterKind,
  type Point,
} from '../lib/scanner';

type Props = {
  pendingPage: CapturedPage;
  onConfirm: (processed: CapturedPage) => void;
  onRetake: () => void;
  onSkip: (raw: CapturedPage) => void;
};

type Phase =
  | { kind: 'loading-cv' }
  | { kind: 'detecting' }
  | { kind: 'ready' }
  | { kind: 'processing' }
  | { kind: 'error'; message: string };

const HANDLES: (keyof Corners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

export function CropScreen({ pendingPage, onConfirm, onRetake, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>(
    isOpenCVReady() ? { kind: 'detecting' } : { kind: 'loading-cv' }
  );
  const [corners, setCorners] = useState<Corners>(
    defaultCorners(pendingPage.width, pendingPage.height)
  );
  const [filter, setFilter] = useState<FilterKind>('gray');
  const [draggingHandle, setDraggingHandle] = useState<keyof Corners | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-detect on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isOpenCVReady()) {
          await loadOpenCV();
          if (cancelled) return;
        }
        setPhase({ kind: 'detecting' });
        const detected = await detectPaperCorners(pendingPage.dataUrl);
        if (cancelled) return;
        if (detected) setCorners(detected);
        setPhase({ kind: 'ready' });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Erro inesperado.';
        setPhase({ kind: 'error', message: msg });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imageAspect = pendingPage.width / pendingPage.height;

  // Convert screen coords (relative to container) to image coords.
  const screenToImage = useCallback((sx: number, sy: number): Point => {
    const c = containerRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: ((sx - rect.left) / rect.width) * pendingPage.width,
      y: ((sy - rect.top) / rect.height) * pendingPage.height,
    };
  }, [pendingPage.width, pendingPage.height]);

  const onPointerMove = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!draggingHandle) return;
    e.preventDefault();
    const p = screenToImage(e.clientX, e.clientY);
    p.x = Math.max(0, Math.min(pendingPage.width, p.x));
    p.y = Math.max(0, Math.min(pendingPage.height, p.y));
    setCorners((prev) => ({ ...prev, [draggingHandle]: p }));
  }, [draggingHandle, screenToImage, pendingPage.width, pendingPage.height]);

  const onPointerUp = useCallback(() => {
    setDraggingHandle(null);
  }, []);

  useEffect(() => {
    if (!draggingHandle) return;
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, [draggingHandle, onPointerMove, onPointerUp]);

  const handleConfirm = useCallback(async () => {
    setPhase({ kind: 'processing' });
    try {
      const processedUrl = await rectifyAndFilter(pendingPage.dataUrl, corners, filter);
      const img = await loadImage(processedUrl);
      console.log(`[femme-vita] página processada ${img.naturalWidth}×${img.naturalHeight} (${filter})`);
      const processed: CapturedPage = {
        id: pendingPage.id,
        dataUrl: processedUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        bytes: estimateDataUrlBytes(processedUrl),
        capturedAt: pendingPage.capturedAt,
      };
      onConfirm(processed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar.';
      setPhase({ kind: 'error', message: msg });
    }
  }, [pendingPage, corners, filter, onConfirm]);

  // Build SVG polygon path from corners (image coords → percent based positioning is easier)
  const cornerPercent = useMemo(() => {
    const toPct = (p: Point) => ({
      x: (p.x / pendingPage.width) * 100,
      y: (p.y / pendingPage.height) * 100,
    });
    return {
      topLeft: toPct(corners.topLeft),
      topRight: toPct(corners.topRight),
      bottomRight: toPct(corners.bottomRight),
      bottomLeft: toPct(corners.bottomLeft),
    };
  }, [corners, pendingPage.width, pendingPage.height]);

  const polygonPoints = `${cornerPercent.topLeft.x},${cornerPercent.topLeft.y} ${cornerPercent.topRight.x},${cornerPercent.topRight.y} ${cornerPercent.bottomRight.x},${cornerPercent.bottomRight.y} ${cornerPercent.bottomLeft.x},${cornerPercent.bottomLeft.y}`;

  const isInteractive = phase.kind === 'ready';
  const isBusy = phase.kind === 'loading-cv' || phase.kind === 'detecting' || phase.kind === 'processing';

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-navy-deep">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Logo variant="light" size="sm" />
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-bone/50">
          {phase.kind === 'loading-cv' && 'carregando OCR…'}
          {phase.kind === 'detecting' && 'detectando bordas…'}
          {phase.kind === 'ready' && 'ajuste os cantos'}
          {phase.kind === 'processing' && 'processando…'}
          {phase.kind === 'error' && <span className="text-danger">erro</span>}
        </div>
      </header>

      {/* Image + overlay */}
      <div className="relative flex-1 px-3 py-2">
        <div
          ref={containerRef}
          className="relative mx-auto h-full w-full"
          style={{ aspectRatio: `${imageAspect}`, maxHeight: '100%' }}
        >
          <img
            src={pendingPage.dataUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          />
          {/* Overlay polygon */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              points={polygonPoints}
              fill="rgba(245, 164, 28, 0.15)"
              stroke="#F5A41C"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Corner handles */}
          {isInteractive && HANDLES.map((handleKey) => {
            const p = cornerPercent[handleKey];
            return (
              <button
                key={handleKey}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setDraggingHandle(handleKey);
                }}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none active:scale-110"
                style={{ left: `${p.x}%`, top: `${p.y}%`, padding: '24px' }}
                aria-label={`Canto ${handleKey}`}
              >
                <span className="block h-7 w-7 rounded-full border-2 border-amber bg-bone/90 shadow-amber" />
              </button>
            );
          })}
          {/* Busy overlay */}
          {isBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-navy-deep/85 backdrop-blur-sm">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-bone/20 border-t-amber" />
                <p className="font-serif text-xl italic text-bone">
                  {phase.kind === 'loading-cv' && 'baixando OpenCV…'}
                  {phase.kind === 'detecting' && 'detectando bordas'}
                  {phase.kind === 'processing' && 'aplicando filtros'}
                </p>
                {phase.kind === 'loading-cv' && (
                  <p className="mt-2 font-mono text-[10px] tracking-wider uppercase text-bone/40">
                    1ª vez · ~8MB · depois fica em cache
                  </p>
                )}
              </div>
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-navy-deep/95 px-6 text-center">
              <div>
                <p className="font-serif text-2xl italic text-bone mb-3">Erro no scanner</p>
                <p className="text-sm text-bone/60">{phase.message}</p>
                <button
                  onClick={() => onSkip(pendingPage)}
                  className="mt-6 rounded-xl border border-bone/30 px-4 py-2 font-mono text-[11px] tracking-wider uppercase text-bone"
                >
                  Usar foto sem crop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter selector */}
      {isInteractive && (
        <div className="px-5 py-3">
          <div className="mx-auto flex max-w-md justify-center gap-2 rounded-full border border-bone/10 bg-bone/5 p-1 backdrop-blur-sm">
            <FilterButton active={filter === 'bw'} onClick={() => setFilter('bw')}>P&B</FilterButton>
            <FilterButton active={filter === 'gray'} onClick={() => setFilter('gray')}>Cinza</FilterButton>
            <FilterButton active={filter === 'color'} onClick={() => setFilter('color')}>Cor</FilterButton>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <footer className="relative z-20 grid grid-cols-3 items-center gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <button
          onClick={onRetake}
          disabled={isBusy}
          className="flex h-14 items-center justify-center rounded-2xl border border-bone/15 bg-bone/5 font-mono text-[11px] tracking-wider uppercase text-bone transition active:scale-[0.98] disabled:opacity-40"
        >
          ← Re-tirar
        </button>
        <button
          onClick={() => onSkip(pendingPage)}
          disabled={isBusy}
          className="flex h-14 items-center justify-center rounded-2xl border border-bone/15 bg-transparent font-mono text-[11px] tracking-wider uppercase text-bone/70 transition active:scale-[0.98] disabled:opacity-40"
        >
          Pular crop
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isInteractive}
          className="flex h-14 items-center justify-center rounded-2xl bg-amber font-mono text-[11px] tracking-wider uppercase text-navy-deep shadow-amber transition active:scale-[0.98] disabled:opacity-40 disabled:bg-bone-200 disabled:shadow-none"
        >
          Confirmar →
        </button>
      </footer>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full px-4 py-1.5 font-mono text-[11px] tracking-wider uppercase transition active:scale-95 ${
        active ? 'bg-amber text-navy-deep' : 'text-bone/60 hover:text-bone'
      }`}
    >
      {children}
    </button>
  );
}
