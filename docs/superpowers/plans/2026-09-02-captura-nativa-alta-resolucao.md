# Captura nativa em alta resolução — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a captura por frame de vídeo por foto da câmera nativa do iPhone e processar as páginas em até 2600 px, para que as guias de internação cheguem legíveis (≈220 DPI) ao PDF no Drive.

**Architecture:** A tela de câmera vira uma tela de "bancada" com um `<input type="file" capture="environment">` oculto; a foto é decodificada uma vez para no máximo 2600 px. O scanner detecta bordas numa cópia de 1000 px e recorta na imagem grande sem o piso de 800 px. A análise do Claude recebe uma cópia de 1600 px; o upload recebe a versão grande, com uma guarda que reencoda se o corpo passar de 4,2 MB. Servidor não muda.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind 4, OpenCV.js (em `/public/opencv.js`), Vitest (novo, só para funções puras).

**Spec:** `docs/superpowers/specs/2026-09-02-captura-nativa-alta-resolucao-design.md`

**Repo:** `C:\Users\User\Developer\femme-vita-app`, branch `feat/captura-nativa-alta-resolucao`. Todos os comandos abaixo rodam nesse diretório.

---

## Mapa de arquivos

| Arquivo | Responsabilidade após o plano |
|---|---|
| `src/lib/camera.ts` | Tipos `CapturedPage`; constantes de resolução; helpers puros (`fitWithin`, `estimateDataUrlBytes`, `payloadBytes`); `loadImage`; `loadPhotoFile` (foto → 2600 px); `downscaleDataUrl`; `fitPagesToBudget`. Sem `getUserMedia`. |
| `src/lib/camera.test.ts` | Testes dos helpers puros de `camera.ts`. |
| `src/lib/scanner.ts` | Detecção de bordas em cópia de 1000 px; `scaleCorners`/`clampCorners` puros; recorte sem piso, com teto 2600 e `INTER_CUBIC`; JPEG 0.88. |
| `src/lib/scanner.test.ts` | Testes de `scaleCorners`/`clampCorners`. |
| `src/components/CameraScreen.tsx` | Tela de bancada com inputs de câmera e galeria; sem `<video>`. |
| `src/components/CropScreen.tsx` | Usa `loadImage`/`estimateDataUrlBytes` compartilhados (remove duplicata). |
| `src/lib/api.ts` | `analyzePages` envia cópias de 1600 px. |
| `src/App.tsx` | `performSave` aplica rotação e depois `fitPagesToBudget`. |
| `package.json` | Script `test` e devDependency `vitest`. |

---

### Task 1: Vitest e helpers puros de resolução

**Files:**
- Modify: `package.json`
- Modify: `src/lib/camera.ts`
- Create: `src/lib/camera.test.ts`

- [ ] **Step 1: Instalar o Vitest e adicionar o script de teste**

Run:
```bash
npm install -D vitest@^3
```

Em `package.json`, dentro de `"scripts"`, adicionar:
```json
"test": "vitest run"
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/lib/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimateDataUrlBytes, fitWithin, payloadBytes } from './camera';

describe('fitWithin', () => {
  it('reduz proporcionalmente quando o lado maior passa do teto', () => {
    expect(fitWithin(3024, 4032, 2600)).toEqual({ width: 1950, height: 2600, scale: 2600 / 4032 });
  });

  it('não amplia imagens menores que o teto', () => {
    expect(fitWithin(800, 1100, 2600)).toEqual({ width: 800, height: 1100, scale: 1 });
  });

  it('usa a largura como lado maior em paisagem', () => {
    const r = fitWithin(4000, 3000, 1000);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(750);
  });
});

describe('estimateDataUrlBytes', () => {
  it('estima 3/4 do tamanho do base64 após a vírgula', () => {
    const b64 = 'A'.repeat(4000);
    expect(estimateDataUrlBytes(`data:image/jpeg;base64,${b64}`)).toBe(3000);
  });

  it('funciona com PNG', () => {
    const b64 = 'A'.repeat(400);
    expect(estimateDataUrlBytes(`data:image/png;base64,${b64}`)).toBe(300);
  });
});

describe('payloadBytes', () => {
  it('soma o comprimento das data URLs', () => {
    expect(payloadBytes(['abc', 'de'])).toBe(5);
  });

  it('retorna 0 para lista vazia', () => {
    expect(payloadBytes([])).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `fitWithin`, `estimateDataUrlBytes`, `payloadBytes` não são exportados por `./camera`.

- [ ] **Step 4: Implementar os helpers em `src/lib/camera.ts`**

Adicionar ao final de `src/lib/camera.ts` (mantendo tudo que já existe por enquanto):

```ts
/** Lado maior da página processada que vai para o PDF (≈220 DPI em A4). */
export const MAX_PAGE_DIMENSION = 2600;
/** Lado maior da cópia enviada ao Claude (a API reduz para ~1568 de qualquer forma). */
export const ANALYZE_MAX_DIMENSION = 1600;
/** Orçamento do corpo JSON do upload. A Vercel rejeita corpos acima de 4,5 MB. */
export const UPLOAD_BUDGET_BYTES = Math.round(4.2 * 1024 * 1024);
/** Tetos sucessivos usados pela guarda de tamanho quando o orçamento estoura. */
export const REENCODE_STEPS: readonly number[] = [2200, 1900];

export type Fit = { width: number; height: number; scale: number };

/** Escala (nunca amplia) para caber em `maxDim` no lado maior. */
export function fitWithin(width: number, height: number, maxDim: number): Fit {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}

/** Bytes aproximados da imagem codificada numa data URL base64. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64Length = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  return Math.round(b64Length * 0.75);
}

/** Tamanho aproximado do corpo JSON: 1 char ≈ 1 byte em base64. */
export function payloadBytes(dataUrls: string[]): number {
  return dataUrls.reduce((sum, url) => sum + url.length, 0);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/camera.ts src/lib/camera.test.ts
git commit -m "test: vitest + helpers puros de resolução em camera.ts"
```

---

### Task 2: Decodificação da foto e cópias reduzidas

**Files:**
- Modify: `src/lib/camera.ts`

Não há teste automatizado: são funções de canvas. A verificação é manual na Task 7.

- [ ] **Step 1: Adicionar `loadImage`, `drawScaled`, `loadPhotoFile`, `downscaleDataUrl` e `fitPagesToBudget`**

Adicionar ao final de `src/lib/camera.ts`:

```ts
/** Carrega uma imagem (data URL ou object URL). Safari e Chrome aplicam a orientação EXIF. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    img.src = src;
  });
}

type Encoded = { dataUrl: string; width: number; height: number };

/** Desenha a imagem num canvas já no tamanho final (nunca amplia) e codifica. */
function drawScaled(
  img: HTMLImageElement,
  maxDim: number,
  mime: 'image/jpeg' | 'image/png',
  quality: number
): Encoded {
  const fit = fitWithin(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar contexto 2D.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, fit.width, fit.height);
  return { dataUrl: canvas.toDataURL(mime, quality), width: fit.width, height: fit.height };
}

/**
 * Converte a foto vinda do input (câmera nativa ou galeria) numa página de até
 * MAX_PAGE_DIMENSION no lado maior. Uma única codificação JPEG antes do scanner.
 */
export async function loadPhotoFile(file: File): Promise<CapturedPage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo escolhido não é uma imagem.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Não foi possível ler as dimensões da foto.');
    }
    const { dataUrl, width, height } = drawScaled(img, MAX_PAGE_DIMENSION, 'image/jpeg', 0.92);
    return {
      id: crypto.randomUUID(),
      dataUrl,
      width,
      height,
      bytes: estimateDataUrlBytes(dataUrl),
      capturedAt: Date.now(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Cópia JPEG reduzida para `maxDim`. Devolve a própria data URL quando já é
 * JPEG e já cabe no teto (evita recodificar à toa). PNG sempre vira JPEG.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxDim: number = ANALYZE_MAX_DIMENSION,
  quality = 0.85
): Promise<string> {
  const img = await loadImage(dataUrl);
  const fitsAlready = Math.max(img.naturalWidth, img.naturalHeight) <= maxDim;
  if (fitsAlready && dataUrl.startsWith('data:image/jpeg')) return dataUrl;
  return drawScaled(img, maxDim, 'image/jpeg', quality).dataUrl;
}

/**
 * Guarda de tamanho do upload: enquanto o corpo passar de `budget`, reencoda
 * todas as páginas nos tetos de REENCODE_STEPS. Se ainda passar, devolve
 * assim mesmo e o erro do servidor aparece na tela de erro.
 */
export async function fitPagesToBudget(
  pages: CapturedPage[],
  budget: number = UPLOAD_BUDGET_BYTES
): Promise<CapturedPage[]> {
  let current = pages;
  for (const maxDim of REENCODE_STEPS) {
    const total = payloadBytes(current.map((p) => p.dataUrl));
    if (total <= budget) break;
    console.log(`[femme-vita] upload ${formatBytes(total)} > orçamento; reencodando em ${maxDim}px`);
    current = await Promise.all(
      current.map(async (p) => {
        const dataUrl = await downscaleDataUrl(p.dataUrl, maxDim, 0.85);
        const img = await loadImage(dataUrl);
        return {
          ...p,
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          bytes: estimateDataUrlBytes(dataUrl),
        };
      })
    );
  }
  return current;
}
```

- [ ] **Step 2: Confirmar que compila**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/camera.ts
git commit -m "feat(camera): loadPhotoFile, downscaleDataUrl e fitPagesToBudget"
```

---

### Task 3: Tela de captura com câmera nativa

**Files:**
- Modify: `src/components/CameraScreen.tsx` (reescrever inteiro)

- [ ] **Step 1: Substituir o conteúdo de `src/components/CameraScreen.tsx`**

```tsx
import { useCallback, useRef, useState } from 'react';
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

  const onFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
```

- [ ] **Step 2: Confirmar que compila e passa no lint**

Run: `npx tsc -b && npm run lint`
Expected: sem erros. (Se o lint reclamar de `React.ChangeEvent` sem import, trocar o tipo do parâmetro por `import type { ChangeEvent } from 'react'` e usar `ChangeEvent<HTMLInputElement>`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/CameraScreen.tsx
git commit -m "feat(camera): tela de captura com câmera nativa (input capture) e galeria"
```

---

### Task 4: Remover o código de vídeo e a duplicata de `loadImage`

**Files:**
- Modify: `src/lib/camera.ts`
- Modify: `src/components/CropScreen.tsx`

- [ ] **Step 1: Remover de `src/lib/camera.ts`**

Apagar: o tipo `CameraStreamHandle`, as constantes `MAX_DIMENSION` e `JPEG_QUALITY`, e as funções `startCamera`, `stopCamera` e `captureFrame`. Manter `CapturedPage`, `formatBytes` e tudo que foi adicionado nas Tasks 1 e 2.

- [ ] **Step 2: Em `src/components/CropScreen.tsx`, usar os helpers compartilhados**

Trocar a linha de import de tipo:
```ts
import type { CapturedPage } from '../lib/camera';
```
por:
```ts
import { estimateDataUrlBytes, loadImage, type CapturedPage } from '../lib/camera';
```

Em `handleConfirm`, trocar:
```ts
      const img = await loadImage(processedUrl);
      const approxBytes = Math.round((processedUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
      const processed: CapturedPage = {
        id: pendingPage.id,
        dataUrl: processedUrl,
        width: img.width,
        height: img.height,
        bytes: approxBytes,
        capturedAt: pendingPage.capturedAt,
      };
```
por:
```ts
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
```

Apagar a função local `loadImage` no final do arquivo (a que lança "Falha ao carregar imagem processada.").

- [ ] **Step 3: Confirmar que nada mais referencia o código removido**

Run: `grep -rn "startCamera\|stopCamera\|captureFrame\|CameraStreamHandle\|MAX_DIMENSION\b" src`
Expected: nenhuma linha.

Run: `npx tsc -b && npm run lint && npm test`
Expected: sem erros; 7 testes passando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/camera.ts src/components/CropScreen.tsx
git commit -m "refactor(camera): remove getUserMedia e unifica loadImage"
```

---

### Task 5: Scanner — detecção em cópia reduzida, recorte sem piso, teto 2600

**Files:**
- Modify: `src/lib/scanner.ts`
- Create: `src/lib/scanner.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/scanner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampCorners, scaleCorners, type Corners } from './scanner';

const corners: Corners = {
  topLeft: { x: 10, y: 20 },
  topRight: { x: 90, y: 22 },
  bottomRight: { x: 92, y: 180 },
  bottomLeft: { x: 8, y: 178 },
};

describe('scaleCorners', () => {
  it('multiplica todas as coordenadas pelo fator', () => {
    expect(scaleCorners(corners, 2)).toEqual({
      topLeft: { x: 20, y: 40 },
      topRight: { x: 180, y: 44 },
      bottomRight: { x: 184, y: 360 },
      bottomLeft: { x: 16, y: 356 },
    });
  });

  it('fator 1 devolve cópia igual', () => {
    expect(scaleCorners(corners, 1)).toEqual(corners);
  });
});

describe('clampCorners', () => {
  it('limita ao retângulo [0,width]×[0,height]', () => {
    const wild: Corners = {
      topLeft: { x: -5, y: -3 },
      topRight: { x: 105, y: 0 },
      bottomRight: { x: 100.4, y: 200.7 },
      bottomLeft: { x: 0, y: 250 },
    };
    expect(clampCorners(wild, 100, 200)).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 200 },
      bottomLeft: { x: 0, y: 200 },
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `scaleCorners`/`clampCorners` não exportados.

- [ ] **Step 3: Implementar em `src/lib/scanner.ts`**

No topo do arquivo, após `const OPENCV_URL = '/opencv.js';`, adicionar:
```ts
import { fitWithin, loadImage, MAX_PAGE_DIMENSION } from './camera';

/** Lado maior da cópia usada só para detectar bordas (rápida no celular). */
const DETECT_MAX_DIMENSION = 1000;
```

Apagar a função local `loadImage` (a que lança "Falha ao carregar imagem.") — agora vem de `./camera`.

Após `function distance(...)`, adicionar:
```ts
export function scaleCorners(c: Corners, factor: number): Corners {
  const s = (p: Point): Point => ({ x: p.x * factor, y: p.y * factor });
  return {
    topLeft: s(c.topLeft),
    topRight: s(c.topRight),
    bottomRight: s(c.bottomRight),
    bottomLeft: s(c.bottomLeft),
  };
}

export function clampCorners(c: Corners, width: number, height: number): Corners {
  const k = (p: Point): Point => ({
    x: Math.min(width, Math.max(0, p.x)),
    y: Math.min(height, Math.max(0, p.y)),
  });
  return {
    topLeft: k(c.topLeft),
    topRight: k(c.topRight),
    bottomRight: k(c.bottomRight),
    bottomLeft: k(c.bottomLeft),
  };
}
```

Substituir o início de `detectPaperCorners` (até a linha `const srcMat: CvAny = cv.imread(img);` inclusive) por:
```ts
export async function detectPaperCorners(dataUrl: string): Promise<Corners | null> {
  await loadOpenCV();
  const img = await loadImage(dataUrl);
  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;

  // Detecta numa cópia pequena: Canny/contornos ficam rápidos e leves em memória.
  const fit = fitWithin(fullW, fullH, DETECT_MAX_DIMENSION);
  const small = document.createElement('canvas');
  small.width = fit.width;
  small.height = fit.height;
  const sctx = small.getContext('2d');
  if (!sctx) throw new Error('Não foi possível criar contexto 2D.');
  sctx.drawImage(img, 0, 0, fit.width, fit.height);
  const srcMat: CvAny = cv.imread(small);
```

E trocar, no mesmo `detectPaperCorners`, a linha:
```ts
    return cornersFromContour(contour, srcMat);
```
por:
```ts
    const found = cornersFromContour(contour, srcMat);
    if (!found) return null;
    // Volta para as coordenadas da imagem original.
    return clampCorners(scaleCorners(found, 1 / fit.scale), fullW, fullH);
```

Em `rectifyAndFilter`, trocar:
```ts
  const outW = Math.max(Math.round((widthTop + widthBottom) / 2), 800);
  const outH = Math.max(Math.round((heightLeft + heightRight) / 2), 800);
```
por:
```ts
  // Tamanho real medido pelos cantos (sem piso: esticar não cria detalhe),
  // limitado ao teto da página.
  const measuredW = Math.max(1, Math.round((widthTop + widthBottom) / 2));
  const measuredH = Math.max(1, Math.round((heightLeft + heightRight) / 2));
  const { width: outW, height: outH } = fitWithin(measuredW, measuredH, MAX_PAGE_DIMENSION);
```

Trocar a interpolação do warp:
```ts
  cv.warpPerspective(srcMat, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
```
por:
```ts
  cv.warpPerspective(srcMat, warped, M, dsize, cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());
```

Trocar a saída de `rectifyAndFilter`:
```ts
  return canvas.toDataURL('image/jpeg', 0.92);
```
por:
```ts
  return canvas.toDataURL('image/jpeg', 0.88);
```

Em `rotateImageCW`, trocar:
```ts
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
```
por:
```ts
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
```

Atualizar o comentário de `rotateImageCW` de "JPEG q=0.92" para "JPEG q=0.9".

- [ ] **Step 4: Rodar testes, build e lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 10 testes passando; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scanner.ts src/lib/scanner.test.ts
git commit -m "feat(scanner): detecção em cópia de 1000px, recorte sem piso, teto 2600px, INTER_CUBIC"
```

---

### Task 6: Dois níveis de envio e guarda de tamanho

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: `analyzePages` envia cópias de 1600 px**

Em `src/lib/api.ts`, trocar o import:
```ts
import type { CapturedPage } from './camera';
```
por:
```ts
import { downscaleDataUrl, type CapturedPage } from './camera';
```

E em `analyzePages`, trocar:
```ts
export async function analyzePages(pages: CapturedPage[]): Promise<AnalyzeResult> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: pages.map((p) => p.dataUrl) }),
  });
```
por:
```ts
export async function analyzePages(pages: CapturedPage[]): Promise<AnalyzeResult> {
  // O Claude reduz imagens para ~1568px de qualquer forma; mandar a versão
  // grande só deixa a requisição mais lenta.
  const images = await Promise.all(pages.map((p) => downscaleDataUrl(p.dataUrl)));
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
```

- [ ] **Step 2: `performSave` aplica a guarda de tamanho após a rotação**

Em `src/App.tsx`, trocar o import:
```ts
import type { CapturedPage } from './lib/camera';
```
por:
```ts
import { fitPagesToBudget, formatBytes, payloadBytes, type CapturedPage } from './lib/camera';
```

Dentro de `performSave`, trocar:
```ts
        const finalPages =
          rotation > 0
            ? await Promise.all(
                currentPages.map(async (p) => ({ ...p, dataUrl: await rotateImageCW(p.dataUrl, rotation) }))
              )
            : currentPages;
        const uploaded = await uploadDocument(finalPages, fileName, target);
```
por:
```ts
        const rotatedPages =
          rotation > 0
            ? await Promise.all(
                currentPages.map(async (p) => ({ ...p, dataUrl: await rotateImageCW(p.dataUrl, rotation) }))
              )
            : currentPages;
        // Guarda de tamanho: a Vercel rejeita corpos acima de 4,5 MB.
        const finalPages = await fitPagesToBudget(rotatedPages);
        console.log(
          `[femme-vita] upload ${finalPages.length} pág., ${formatBytes(payloadBytes(finalPages.map((p) => p.dataUrl)))}`
        );
        const uploaded = await uploadDocument(finalPages, fileName, target);
```

- [ ] **Step 3: Build, lint e testes**

Run: `npx tsc -b && npm run lint && npm test`
Expected: sem erros; 10 testes passando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/App.tsx
git commit -m "feat: análise em 1600px, upload em alta com guarda de 4,2 MB"
```

---

### Task 7: Verificação manual no navegador e medição do PDF

**Files:** nenhum (verificação).

- [ ] **Step 1: Preparar uma "foto" de teste em alta resolução**

Usar o script do diagnóstico para extrair a imagem de uma guia antiga em boa resolução (ex. `Renata Vieira de Mello`, 2014×2875) para o scratchpad como `foto_teste.jpg`. Opcionalmente ampliar para 3024×4032 com PIL (`Image.resize`, LANCZOS) para simular o sensor do iPhone.

- [ ] **Step 2: Subir o dev server e abrir no Browser pane**

Run: `npm run dev` (via `preview_start`, porta 5173). Fazer login com a conta do Drive (o fluxo OAuth já funciona em `localhost` se o redirect URI de dev estiver cadastrado; se não, testar até a tela de crop, que não exige login).

- [ ] **Step 3: Verificar a captura**

Na tela de bancada, clicar em "ou escolher da galeria" (no desktop o `capture` não tem efeito) e selecionar `foto_teste.jpg`. Esperado no console:
```
[femme-vita] foto image/jpeg → 1950×2600
```
(ou o tamanho original se for menor que 2600 no lado maior).

- [ ] **Step 4: Verificar o crop**

Na tela de crop: bordas detectadas em menos de ~2 s; confirmar com filtro Cinza. Esperado no console:
```
[femme-vita] página processada ~1800..2600 × ~2500..2600 (gray)
```
A largura tem de ser bem maior que 800.

- [ ] **Step 5: Verificar o PDF final**

Concluir o fluxo até "salvo". Abrir o PDF gerado no Drive (ou baixar) e medir com PyMuPDF:
```python
import fitz, sys
doc = fitz.open(sys.argv[1])
for p in doc:
    for img in p.get_images(full=True):
        i = doc.extract_image(img[0]); print(i["width"], i["height"], i["ext"], len(i["image"])//1024, "KB")
```
Esperado: largura > 1800 px, lado maior ≈ 2600, DPI equivalente ≥ 180.

- [ ] **Step 6: Verificar a guarda de tamanho**

Capturar 4 vezes a mesma foto de teste com filtro Cor (JPEG maior) e finalizar. Esperado no console, se o total passar de 4,2 MB:
```
[femme-vita] upload X MB > orçamento; reencodando em 2200px
```
e o upload concluir sem erro 413.

- [ ] **Step 7: Registrar o resultado**

Anotar no final da spec, seção "Verificação", as dimensões medidas e a data. Commit:
```bash
git add docs/superpowers/specs/2026-09-02-captura-nativa-alta-resolucao-design.md
git commit -m "docs: resultado da verificação da captura em alta resolução"
```

Teste real no iPhone e deploy (`vercel --prod --yes --scope bolao`) ficam para depois da aprovação do usuário.
