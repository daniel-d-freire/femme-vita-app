import { useCallback, useEffect, useState } from 'react';
import { CameraScreen } from './components/CameraScreen';
import { CropScreen } from './components/CropScreen';
import { PagesStack } from './components/PagesStack';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { LoginScreen } from './components/LoginScreen';
import { SavedScreen } from './components/SavedScreen';
import type { CapturedPage } from './lib/camera';
import {
  ApiError,
  analyzePages,
  fetchAuthState,
  fetchFolders,
  isAutoSaveEligible,
  logout,
  uploadDocument,
  type AnalyzeResult,
  type AuthUser,
  type FoldersResponse,
  type UploadResponse,
  type UploadTarget,
} from './lib/api';
import { buildFileName, matchFolder } from './lib/folder-match';
import { loadOpenCV, rotateImageCW } from './lib/scanner';

type Screen =
  | { kind: 'camera' }
  | { kind: 'crop'; pending: CapturedPage }
  | { kind: 'review' }
  | { kind: 'processing'; phase: 'analyzing' | 'saving' }
  | { kind: 'result'; result: AnalyzeResult }
  | { kind: 'saved'; result: UploadResponse }
  | { kind: 'error'; message: string; recoverable: 'analyze' | 'save' };

type AuthStatus =
  | { kind: 'loading' }
  | { kind: 'unauthenticated'; error?: string }
  | { kind: 'authenticated'; user: AuthUser; folders: FoldersResponse | null; foldersError?: string };

export default function App() {
  const [auth, setAuth] = useState<AuthStatus>({ kind: 'loading' });
  const [screen, setScreen] = useState<Screen>({ kind: 'camera' });
  const [pages, setPages] = useState<CapturedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await fetchAuthState();
        if (cancelled) return;
        if (!state.authenticated) {
          setAuth({ kind: 'unauthenticated' });
          return;
        }
        try {
          const folders = await fetchFolders();
          if (cancelled) return;
          setAuth({ kind: 'authenticated', user: state.user, folders });
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof ApiError ? (err.body.message || err.body.error) : (err as Error).message;
          setAuth({ kind: 'authenticated', user: state.user, folders: null, foldersError: msg });
        }
        // Preload OpenCV in the background so the first crop is instant.
        loadOpenCV().catch(() => undefined);
      } catch (err) {
        if (cancelled) return;
        setAuth({ kind: 'unauthenticated', error: (err as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCapture = useCallback((page: CapturedPage) => {
    // Route captures through the crop step.
    setScreen({ kind: 'crop', pending: page });
  }, []);

  const handleCropConfirm = useCallback((processed: CapturedPage) => {
    setPages((prev) => [...prev, processed]);
    setScreen({ kind: 'camera' });
  }, []);

  const handleCropSkip = useCallback((raw: CapturedPage) => {
    setPages((prev) => [...prev, raw]);
    setScreen({ kind: 'camera' });
  }, []);

  const handleCropRetake = useCallback(() => {
    // Discard the pending capture and return to camera.
    setScreen({ kind: 'camera' });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const performSave = useCallback(
    async (
      currentPages: CapturedPage[],
      target: UploadTarget,
      fileName: string,
      rotation: AnalyzeResult['rotation_to_apply']
    ) => {
      setScreen({ kind: 'processing', phase: 'saving' });
      try {
        // Log pra debug: confirma o que Claude reportou.
        console.log(`[femme-vita] rotation_to_apply = ${rotation}° (file: ${fileName})`);
        // Aplica a rotação que o Claude reportou pra deixar o documento em pé
        // (0 é no-op). Combina com a auto-orientação da página PDF no servidor
        // pra garantir que a página final fica na orientação correta.
        const finalPages =
          rotation > 0
            ? await Promise.all(
                currentPages.map(async (p) => ({ ...p, dataUrl: await rotateImageCW(p.dataUrl, rotation) }))
              )
            : currentPages;
        const uploaded = await uploadDocument(finalPages, fileName, target);
        setScreen({ kind: 'saved', result: uploaded });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuth({ kind: 'unauthenticated', error: 'Sua sessão expirou. Faça login novamente.' });
          setPages([]);
          setScreen({ kind: 'camera' });
          return;
        }
        const message =
          err instanceof ApiError
            ? err.body.message || err.body.error || 'Erro ao salvar.'
            : err instanceof Error
              ? err.message
              : 'Erro ao salvar.';
        setScreen({ kind: 'error', message, recoverable: 'save' });
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (pages.length === 0 || auth.kind !== 'authenticated') return;
    setScreen({ kind: 'processing', phase: 'analyzing' });
    try {
      const result = await analyzePages(pages);
      const folders = auth.folders?.folders ?? [];
      const match = result.patient_name ? matchFolder(result.patient_name, folders) : null;

      if (isAutoSaveEligible(result, match) && match && result.document_type) {
        const fileName = buildFileName(result.document_type, match.folder.name);
        await performSave(
          pages,
          { kind: 'folderId', folderId: match.folder.id },
          fileName,
          result.rotation_to_apply
        );
        return;
      }

      setScreen({ kind: 'result', result });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth({ kind: 'unauthenticated', error: 'Sua sessão expirou. Faça login novamente.' });
        setPages([]);
        setScreen({ kind: 'camera' });
        return;
      }
      const message =
        err instanceof ApiError
          ? err.body.message || err.body.error || 'Erro ao analisar.'
          : err instanceof Error
            ? err.message
            : 'Erro ao analisar.';
      setScreen({ kind: 'error', message, recoverable: 'analyze' });
    }
  }, [pages, auth, performSave]);

  const handleManualSave = useCallback(
    (target: UploadTarget, fileName: string, rotation: AnalyzeResult['rotation_to_apply']) => {
      performSave(pages, target, fileName, rotation);
    },
    [pages, performSave]
  );

  const handleRestart = useCallback(() => {
    setPages([]);
    setScreen({ kind: 'camera' });
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuth({ kind: 'unauthenticated' });
    setPages([]);
    setScreen({ kind: 'camera' });
  }, []);

  if (auth.kind === 'loading') return <BootScreen />;
  if (auth.kind === 'unauthenticated') return <LoginScreen error={auth.error} />;

  switch (screen.kind) {
    case 'crop':
      return (
        <CropScreen
          pendingPage={screen.pending}
          onConfirm={handleCropConfirm}
          onSkip={handleCropSkip}
          onRetake={handleCropRetake}
        />
      );

    case 'processing':
      return <ProcessingScreen pageCount={pages.length} phase={screen.phase} />;

    case 'result':
      return (
        <ResultScreen
          result={screen.result}
          pageCount={pages.length}
          firstPageDataUrl={pages[0]?.dataUrl ?? ''}
          folders={auth.folders?.folders ?? []}
          onSave={handleManualSave}
          onBackToReview={() => setScreen({ kind: 'review' })}
        />
      );

    case 'saved':
      return <SavedScreen result={screen.result} onNewDocument={handleRestart} />;

    case 'error':
      return (
        <ErrorScreen
          message={screen.message}
          onRetry={screen.recoverable === 'analyze' ? handleSubmit : () => setScreen({ kind: 'review' })}
          onBack={() => setScreen({ kind: 'review' })}
        />
      );

    case 'review':
      return (
        <PagesStack
          pages={pages}
          onAddPage={() => setScreen({ kind: 'camera' })}
          onRemovePage={handleRemove}
          onSubmit={handleSubmit}
        />
      );

    case 'camera':
    default:
      return (
        <CameraScreen
          pages={pages}
          onCapture={handleCapture}
          onReview={() => setScreen({ kind: 'review' })}
          user={auth.user}
          folderCount={auth.folders?.folders.length ?? null}
          foldersError={auth.foldersError}
          onLogout={handleLogout}
        />
      );
  }
}

function BootScreen() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-bone">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-navy/10 border-t-amber" />
    </div>
  );
}

function ErrorScreen({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack: () => void }) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-bone px-6 text-center">
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-danger/15 text-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">algo deu errado</p>
      <h1 className="mt-2 max-w-sm font-serif text-3xl italic leading-tight text-navy">Não consegui salvar agora</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-navy/60">{message}</p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <button
          onClick={onRetry}
          className="flex h-14 items-center justify-center rounded-2xl bg-navy font-mono text-[11px] tracking-wider uppercase text-bone shadow-lifted transition active:scale-[0.98]"
        >
          Tentar novamente
        </button>
        <button
          onClick={onBack}
          className="flex h-14 items-center justify-center rounded-2xl border border-navy/15 bg-bone-50 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-[0.98]"
        >
          Voltar para as páginas
        </button>
      </div>
    </div>
  );
}
