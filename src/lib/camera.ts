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
