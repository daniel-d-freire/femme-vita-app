export type CapturedPage = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  capturedAt: number;
};

export type CameraStreamHandle = {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export async function startCamera(facingMode: 'environment' | 'user' = 'environment'): Promise<CameraStreamHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Câmera não disponível neste navegador.');
  }

  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Nenhuma câmera de vídeo encontrada.');
  }
  return { stream, videoTrack };
}

export function stopCamera(handle: CameraStreamHandle | null): void {
  if (!handle) return;
  handle.stream.getTracks().forEach((t) => t.stop());
}

export async function captureFrame(video: HTMLVideoElement): Promise<CapturedPage> {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) {
    throw new Error('Câmera ainda não está pronta.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(videoWidth, videoHeight));
  const targetW = Math.round(videoWidth * scale);
  const targetH = Math.round(videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar contexto 2D.');
  ctx.drawImage(video, 0, 0, targetW, targetH);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const approxBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);

  return {
    id: crypto.randomUUID(),
    dataUrl,
    width: targetW,
    height: targetH,
    bytes: approxBytes,
    capturedAt: Date.now(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
