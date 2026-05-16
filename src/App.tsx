import { useCallback, useState } from 'react';
import { CameraScreen } from './components/CameraScreen';
import { PagesStack } from './components/PagesStack';
import type { CapturedPage } from './lib/camera';

type Screen = 'camera' | 'review';

export default function App() {
  const [screen, setScreen] = useState<Screen>('camera');
  const [pages, setPages] = useState<CapturedPage[]>([]);

  const handleCapture = useCallback((page: CapturedPage) => {
    setPages((prev) => [...prev, page]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    // M2 will wire this up to /api/analyze
    alert(`M1 entregue ✓\n\n${pages.length} página${pages.length === 1 ? '' : 's'} capturada${pages.length === 1 ? '' : 's'}.\n\nA leitura automática (Claude Vision) chega no M2.`);
  }, [pages.length]);

  if (screen === 'review') {
    return (
      <PagesStack
        pages={pages}
        onAddPage={() => setScreen('camera')}
        onRemovePage={handleRemove}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <CameraScreen
      pages={pages}
      onCapture={handleCapture}
      onReview={() => setScreen('review')}
    />
  );
}
