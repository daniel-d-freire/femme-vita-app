import { useCallback, useEffect, useState } from 'react';
import { CameraScreen } from './components/CameraScreen';
import { PagesStack } from './components/PagesStack';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { LoginScreen } from './components/LoginScreen';
import type { CapturedPage } from './lib/camera';
import {
  ApiError,
  analyzePages,
  fetchAuthState,
  fetchFolders,
  logout,
  type AnalyzeResult,
  type AuthUser,
  type FoldersResponse,
} from './lib/api';

type Screen =
  | { kind: 'camera' }
  | { kind: 'review' }
  | { kind: 'processing' }
  | { kind: 'result'; result: AnalyzeResult }
  | { kind: 'error'; message: string };

type AuthStatus =
  | { kind: 'loading' }
  | { kind: 'unauthenticated'; error?: string }
  | { kind: 'authenticated'; user: AuthUser; folders: FoldersResponse | null; foldersError?: string };

export default function App() {
  const [auth, setAuth] = useState<AuthStatus>({ kind: 'loading' });
  const [screen, setScreen] = useState<Screen>({ kind: 'camera' });
  const [pages, setPages] = useState<CapturedPage[]>([]);

  // Check auth + fetch folders on mount
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
        // Fetch folders in parallel
        try {
          const folders = await fetchFolders();
          if (cancelled) return;
          setAuth({ kind: 'authenticated', user: state.user, folders });
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof ApiError ? (err.body.message || err.body.error) : (err as Error).message;
          setAuth({ kind: 'authenticated', user: state.user, folders: null, foldersError: msg });
        }
      } catch (err) {
        if (cancelled) return;
        setAuth({ kind: 'unauthenticated', error: (err as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCapture = useCallback((page: CapturedPage) => {
    setPages((prev) => [...prev, page]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pages.length === 0) return;
    setScreen({ kind: 'processing' });
    try {
      const result = await analyzePages(pages);
      setScreen({ kind: 'result', result });
    } catch (err) {
      let message = 'Erro ao analisar o documento.';
      if (err instanceof ApiError) {
        message = err.body.message || err.body.error || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setScreen({ kind: 'error', message });
    }
  }, [pages]);

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

  if (auth.kind === 'loading') {
    return <BootScreen />;
  }

  if (auth.kind === 'unauthenticated') {
    return <LoginScreen error={auth.error} />;
  }

  // Authenticated
  switch (screen.kind) {
    case 'processing':
      return <ProcessingScreen pageCount={pages.length} />;

    case 'result':
      return (
        <ResultScreen
          result={screen.result}
          pageCount={pages.length}
          onRestart={handleRestart}
          onBackToReview={() => setScreen({ kind: 'review' })}
        />
      );

    case 'error':
      return (
        <ErrorScreen
          message={screen.message}
          onRetry={handleSubmit}
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
      <h1 className="mt-2 max-w-sm font-serif text-3xl italic leading-tight text-navy">Não consegui ler agora</h1>
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
