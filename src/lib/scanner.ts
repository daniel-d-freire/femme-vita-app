/**
 * Document scanner: detects paper edges, rectifies perspective, applies B&W
 * "scanner" filter. Uses OpenCV.js bundled as a static asset in /public.
 */

import { fitWithin, loadImage, MAX_PAGE_DIMENSION } from './camera';

const OPENCV_URL = '/opencv.js';

/** Lado maior da cópia usada só para detectar bordas (rápida no celular). */
const DETECT_MAX_DIMENSION = 1000;

export type Point = { x: number; y: number };
export type Corners = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

// Global cv (OpenCV.js attaches to window).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvAny = any;

let loadPromise: Promise<void> | null = null;

export function loadOpenCV(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv && w.cv.Mat) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${OPENCV_URL}"]`);
    if (existing) {
      const check = () => {
        if (w.cv && w.cv.Mat) resolve();
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => {
      // OpenCV.js may need to wait for runtime init.
      const cvObj = w.cv;
      if (cvObj && cvObj.Mat) {
        resolve();
      } else if (cvObj && 'onRuntimeInitialized' in cvObj) {
        cvObj.onRuntimeInitialized = () => resolve();
      } else {
        const check = () => {
          if (w.cv && w.cv.Mat) resolve();
          else setTimeout(check, 50);
        };
        check();
      }
    };
    script.onerror = () => reject(new Error('Falha ao carregar OpenCV.js do CDN.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function isOpenCVReady(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((window as any).cv?.Mat);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

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

/**
 * Detects the most prominent quadrilateral (the paper) in the image and
 * returns its 4 corners ordered as { topLeft, topRight, bottomRight, bottomLeft }.
 * Returns null when no convincing paper-like contour was found.
 */
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

  const gray: CvAny = new cv.Mat();
  const edges: CvAny = new cv.Mat();
  const blurred: CvAny = new cv.Mat();
  const thresh: CvAny = new cv.Mat();
  const contours: CvAny = new cv.MatVector();
  const hierarchy: CvAny = new cv.Mat();

  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Candidato 1, pelas bordas: Canny com as falhas fechadas. Só contornos
    // externos — os quadros impressos da guia ficam dentro da folha e não concorrem.
    cv.Canny(blurred, edges, 30, 100);
    const kernelBorda = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernelBorda);
    cv.dilate(edges, edges, kernelBorda);
    kernelBorda.delete();
    const porBorda = maiorQuadrilateroExterno(edges, contours, hierarchy);

    // Candidato 2, pelo claro: o papel é a região clara grande. Fecha o texto
    // escuro para a folha virar uma mancha só.
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const kernelClaro = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(25, 25));
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernelClaro);
    kernelClaro.delete();
    const porClaro = maiorQuadrilateroExterno(thresh, contours, hierarchy);

    const candidatos = [porBorda, porClaro].filter((c): c is CandidatoFolha => c !== null);
    const folha = escolherFolha(candidatos, srcMat.cols * srcMat.rows);
    if (!folha) return null;
    // Volta para as coordenadas da imagem original.
    return clampCorners(scaleCorners(ordenarCantos(folha.quad), 1 / fit.scale), fullW, fullH);
  } finally {
    srcMat.delete();
    gray.delete();
    edges.delete();
    blurred.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
  }
}

export type CandidatoFolha = { quad: Point[]; area: number };

/** Abaixo disso o contorno não é a folha (é um quadro impresso, uma mancha). */
const AREA_MINIMA_FOLHA = 0.2;

/**
 * A folha contém todos os quadros impressos da guia, então entre os candidatos
 * plausíveis vale o maior. Errar para mais deixa um pouco de mesa; errar para
 * menos corta a guia — o que obrigava a ajustar os cantos à mão.
 */
export function escolherFolha(candidatos: CandidatoFolha[], areaImagem: number): CandidatoFolha | null {
  let melhor: CandidatoFolha | null = null;
  for (const c of candidatos) {
    if (c.area < areaImagem * AREA_MINIMA_FOLHA) continue;
    if (!melhor || c.area > melhor.area) melhor = c;
  }
  return melhor;
}

/** Quatro pontos soltos → cantos: menor x+y é o superior esquerdo, maior é o inferior direito; y−x separa os outros dois. */
export function ordenarCantos(pontos: Point[]): Corners {
  const porSoma = [...pontos].sort((a, b) => a.x + a.y - (b.x + b.y));
  const porDiferenca = [...pontos].sort((a, b) => a.y - a.x - (b.y - b.x));
  return {
    topLeft: porSoma[0],
    topRight: porDiferenca[0],
    bottomRight: porSoma[porSoma.length - 1],
    bottomLeft: porDiferenca[porDiferenca.length - 1],
  };
}

/** Maior contorno externo da imagem binária, reduzido a um quadrilátero pelo casco convexo. */
function maiorQuadrilateroExterno(binaria: CvAny, contours: CvAny, hierarchy: CvAny): CandidatoFolha | null {
  cv.findContours(binaria, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let maior = -1;
  let maiorArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const area = cv.contourArea(contours.get(i));
    if (area > maiorArea) {
      maiorArea = area;
      maior = i;
    }
  }
  if (maior < 0) return null;

  const casco: CvAny = new cv.Mat();
  try {
    cv.convexHull(contours.get(maior), casco, false, true);
    const area = cv.contourArea(casco);
    const perimetro = cv.arcLength(casco, true);
    // Simplifica o casco até sobrarem 4 vértices; sem isso, o retângulo mínimo.
    for (const tolerancia of [0.02, 0.03, 0.05, 0.08]) {
      const aprox: CvAny = new cv.Mat();
      try {
        cv.approxPolyDP(casco, aprox, tolerancia * perimetro, true);
        if (aprox.rows === 4) {
          const d: Int32Array = aprox.data32S;
          return { quad: [0, 1, 2, 3].map((k) => ({ x: d[2 * k], y: d[2 * k + 1] })), area };
        }
      } finally {
        aprox.delete();
      }
    }
    const vertices: Point[] = cv.RotatedRect.points(cv.minAreaRect(casco));
    return { quad: vertices.map((p) => ({ x: p.x, y: p.y })), area };
  } finally {
    casco.delete();
  }
}

export type FilterKind = 'bw' | 'gray' | 'color';

/**
 * Applies perspective correction using the given corners, then applies the
 * selected filter, and returns a JPEG data URL.
 */
export async function rectifyAndFilter(
  dataUrl: string,
  corners: Corners,
  filter: FilterKind = 'bw'
): Promise<string> {
  await loadOpenCV();
  const img = await loadImage(dataUrl);
  const srcMat: CvAny = cv.imread(img);

  // Compute output dimensions from corners (avg of top/bottom widths, etc.)
  const widthTop = distance(corners.topLeft, corners.topRight);
  const widthBottom = distance(corners.bottomLeft, corners.bottomRight);
  const heightLeft = distance(corners.topLeft, corners.bottomLeft);
  const heightRight = distance(corners.topRight, corners.bottomRight);
  // Tamanho real medido pelos cantos (sem piso: esticar não cria detalhe),
  // limitado ao teto da página.
  const measuredW = Math.max(1, Math.round((widthTop + widthBottom) / 2));
  const measuredH = Math.max(1, Math.round((heightLeft + heightRight) / 2));
  const { width: outW, height: outH } = fitWithin(measuredW, measuredH, MAX_PAGE_DIMENSION);

  const srcTri: CvAny = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.topLeft.x, corners.topLeft.y,
    corners.topRight.x, corners.topRight.y,
    corners.bottomLeft.x, corners.bottomLeft.y,
    corners.bottomRight.x, corners.bottomRight.y,
  ]);
  const dstTri: CvAny = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outW, 0,
    0, outH,
    outW, outH,
  ]);

  const M: CvAny = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped: CvAny = new cv.Mat();
  const dsize: CvAny = new cv.Size(outW, outH);
  cv.warpPerspective(srcMat, warped, M, dsize, cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());

  // Build output mat per filter.
  let final: CvAny = warped;
  const extras: CvAny[] = [];
  if (filter === 'bw' || filter === 'gray') {
    // Grayscale base.
    const gray: CvAny = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    extras.push(gray);

    // CLAHE: local contrast enhancement. Helps faded form fields and shadows
    // without destroying text anti-aliasing the way a hard threshold would.
    const clahed: CvAny = new cv.Mat();
    const clahe: CvAny = new cv.CLAHE(2.5, new cv.Size(16, 16));
    clahe.apply(gray, clahed);
    clahe.delete();
    extras.push(clahed);

    if (filter === 'gray') {
      final = clahed;
    } else {
      // 'bw': light Gaussian blur to suppress sensor noise, then Otsu.
      // Otsu is a global threshold (one value for the whole page) — much
      // cleaner for evenly-lit documents than adaptive thresholding, which
      // tends to speckle small text on medical forms.
      const blurred: CvAny = new cv.Mat();
      cv.GaussianBlur(clahed, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
      extras.push(blurred);

      const bw: CvAny = new cv.Mat();
      cv.threshold(blurred, bw, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      extras.push(bw);
      final = bw;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  cv.imshow(canvas, final);

  // Clean up.
  srcMat.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  warped.delete();
  for (const m of extras) m.delete();

  // PNG for B&W (hard edges → JPEG would introduce ringing artifacts);
  // JPEG for color/grayscale (much smaller, no perceptible quality loss).
  if (filter === 'bw') {
    return canvas.toDataURL('image/png');
  }
  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Default corners (image inset by a small margin) for when auto-detect
 * fails — gives the user a starting point that's still on-image.
 */
export function defaultCorners(width: number, height: number): Corners {
  const m = Math.min(width, height) * 0.06;
  return {
    topLeft: { x: m, y: m },
    topRight: { x: width - m, y: m },
    bottomRight: { x: width - m, y: height - m },
    bottomLeft: { x: m, y: height - m },
  };
}

/**
 * Rotates the image by `degrees` clockwise (0/90/180/270) via 2D canvas.
 * 0 is a no-op (returns the original dataUrl unchanged). Output format
 * mirrors the input (PNG stays PNG, anything else becomes JPEG q=0.9).
 *
 * Used to apply the orientation correction Claude returns
 * (`rotation_to_apply`) so the final PDF shows the document upright,
 * regardless of how the page was photographed.
 */
export async function rotateImageCW(
  dataUrl: string,
  degrees: 0 | 90 | 180 | 270
): Promise<string> {
  if (degrees === 0) return dataUrl;
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  if (degrees === 180) {
    canvas.width = img.width;
    canvas.height = img.height;
  } else {
    canvas.width = img.height;
    canvas.height = img.width;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar contexto 2D para rotação.');

  if (degrees === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (degrees === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else {
    // 270 CW == 90 CCW
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(img, 0, 0);

  const isPng = dataUrl.startsWith('data:image/png');
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
}
