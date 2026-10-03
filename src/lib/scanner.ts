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
 * Acha a folha na foto e devolve os 4 cantos { topLeft, topRight, bottomRight, bottomLeft }.
 * Nunca devolve null: lado sem borda visível fica na beira da foto.
 */
export async function detectPaperCorners(dataUrl: string): Promise<Corners | null> {
  const img = await loadImage(dataUrl);
  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;

  // Detecta numa cópia pequena: rápido no celular.
  const fit = fitWithin(fullW, fullH, DETECT_MAX_DIMENSION);
  const small = document.createElement('canvas');
  small.width = fit.width;
  small.height = fit.height;
  const sctx = small.getContext('2d');
  if (!sctx) throw new Error('Não foi possível criar contexto 2D.');
  sctx.drawImage(img, 0, 0, fit.width, fit.height);
  const rgba = sctx.getImageData(0, 0, fit.width, fit.height).data;
  const cinza = new Uint8Array(fit.width * fit.height);
  for (let i = 0; i < cinza.length; i++) {
    cinza[i] = (rgba[4 * i] * 299 + rgba[4 * i + 1] * 587 + rgba[4 * i + 2] * 114) / 1000;
  }
  const cantos = acharFolha(cinza, fit.width, fit.height);
  // Volta para as coordenadas da imagem original.
  return clampCorners(scaleCorners(cantos, 1 / fit.scale), fullW, fullH);
}

/** Média 3×3: tira o grão da foto sem borrar a borda do papel. */
function suavizar(px: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let soma = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          soma += px[yy * W + xx];
          n++;
        }
      }
      out[y * W + x] = soma / n;
    }
  }
  return out;
}

// A guia é fotografada enchendo o quadro: a borda do papel fica perto da beira da
// foto, numa margem branca antes da parte impressa. Cada lado é procurado só nessa faixa.
const PROFUNDIDADE_BORDA = 0.25;
/** Quanto o lado de dentro (papel) precisa ser mais claro que o de fora (mesa, sombra). */
const DEGRAU_MINIMO = 20;
/** Parte do comprimento do lado em que o degrau precisa aparecer. */
const APOIO_MINIMO = 0.4;
/**
 * Fora do papel só há mesa. Se mais que esta parte dos pontos ao longo do lado
 * tem tinta entre a reta e a beira, a reta está dentro da guia (uma faixa cinza,
 * um quadro), não na borda.
 */
const TINTA_MAXIMA_FORA = 0.15;
/** Traço de tinta: mais escuro que os vizinhos a 2 px, dos dois lados, por pelo menos isso. */
const VALE_TINTA = 30;
/**
 * Tinta é traço sobre papel: os vizinhos têm de ser quase tão claros quanto o papel
 * daquela linha. Rejunte e mancha de azulejo ficam sobre fundo mais escuro e não contam.
 */
const VIZINHO_DE_PAPEL = 20;

type Lado = 'left' | 'right' | 'top' | 'bottom';
type Reta = { p1: Point; p2: Point };

/**
 * Cantos da folha numa imagem em tons de cinza. Para cada lado,
 * a borda é a reta mais externa onde o papel (dentro) é bem mais claro que o
 * de fora e onde, para fora dela, não há tinta. Sem borda assim, o lado fica na
 * beira da foto: errar para fora deixa um pouco de mesa, errar para dentro corta a guia.
 */
export function acharFolha(cinza: Uint8Array, W: number, H: number): Corners {
  // Degrau na imagem suavizada; tinta na original (a média 3×3 apaga letra pequena).
  const suave = suavizar(cinza, W, H);
  const topo = bordaDoLado(suave, cinza, W, H, 'top');
  const base = bordaDoLado(suave, cinza, W, H, 'bottom');
  const esq = bordaDoLado(suave, cinza, W, H, 'left');
  const dir = bordaDoLado(suave, cinza, W, H, 'right');
  return {
    topLeft: cruzamento(topo, esq),
    topRight: cruzamento(topo, dir),
    bottomRight: cruzamento(base, dir),
    bottomLeft: cruzamento(base, esq),
  };
}

function cruzamento(r: Reta, s: Reta): Point {
  const { x: x1, y: y1 } = r.p1;
  const { x: x2, y: y2 } = r.p2;
  const { x: x3, y: y3 } = s.p1;
  const { x: x4, y: y4 } = s.p2;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * Procura a borda de um lado. "u" anda da beira da foto para dentro e "v" corre
 * ao longo do lado; a reta candidata vai de u=a (em v=0) a u=b (em v=fim).
 */
function bordaDoLado(cinza: Uint8Array, original: Uint8Array, W: number, H: number, lado: Lado): Reta {
  const horizontal = lado === 'top' || lado === 'bottom';
  const U = horizontal ? H : W;
  const V = horizontal ? W : H;
  const pixel = (u: number, v: number): number => {
    switch (lado) {
      case 'left': return v * W + u;
      case 'right': return v * W + (W - 1 - u);
      case 'top': return u * W + v;
      case 'bottom': return (H - 1 - u) * W + v;
    }
  };
  const ponto = (u: number, v: number): Point => {
    switch (lado) {
      case 'left': return { x: u, y: v };
      case 'right': return { x: W - 1 - u, y: v };
      case 'top': return { x: v, y: u };
      case 'bottom': return { x: v, y: H - 1 - u };
    }
  };
  const naBeira: Reta = { p1: ponto(0, 0), p2: ponto(0, V - 1) };

  const minU = 8;
  const D = Math.floor(U * PROFUNDIDADE_BORDA);
  if (D <= minU) return naBeira;
  const colunas = D + 3;
  const amostras: number[] = [];
  for (let v = 3; v < V - 3; v += 3) amostras.push(v);
  const n = amostras.length;

  // degrau[j][u]: no ponto (u, amostra j) o lado de dentro é mais claro que o de fora.
  // forca[j][u]: o salto de brilho bem em u (é máximo exatamente na borda).
  // tinta[j][u]: quantos traços de tinta há entre a beira e u, na amostra j.
  const degrau = new Uint8Array(n * colunas);
  const forca = new Int16Array(n * colunas);
  const tinta = new Uint16Array(n * colunas);
  for (let j = 0; j < n; j++) {
    const v = amostras[j];
    // Brilho do papel nesta linha: o mais claro da faixa (o papel é o mais claro da foto).
    let papel = 0;
    for (let u = 0; u < colunas && u < U; u++) papel = Math.max(papel, cinza[pixel(u, v)]);
    const claro = papel - VIZINHO_DE_PAPEL;
    let acumulado = 0;
    for (let u = 0; u < colunas; u++) {
      tinta[j * colunas + u] = acumulado;
      // Olha as 3 linhas em volta da amostra: traço fino não pode passar entre amostras.
      if (u >= 2 && u + 2 < U) {
        for (let dv = -1; dv <= 1; dv++) {
          const vv = v + dv;
          const c = original[pixel(u, vv)];
          const ladosU = Math.min(original[pixel(u - 2, vv)], original[pixel(u + 2, vv)]);
          const ladosV = Math.min(original[pixel(u, vv - 2)], original[pixel(u, vv + 2)]);
          if ((c + VALE_TINTA < ladosU && ladosU >= claro) || (c + VALE_TINTA < ladosV && ladosV >= claro)) {
            acumulado++;
            break;
          }
        }
      }
      if (u >= minU && u + 8 < U) {
        let fora = 0;
        let dentro = 0;
        for (let d = 3; d <= 8; d++) {
          fora += cinza[pixel(u - d, v)];
          dentro += cinza[pixel(u + d, v)];
        }
        if (dentro - fora >= DEGRAU_MINIMO * 6) degrau[j * colunas + u] = 1;
        forca[j * colunas + u] = cinza[pixel(u + 2, v)] - cinza[pixel(u - 2, v)];
      }
    }
  }

  const uNa = (a: number, b: number, j: number) => Math.round(a + ((b - a) * amostras[j]) / V);
  const apoio = (a: number, b: number): number => {
    let s = 0;
    for (let j = 0; j < n; j++) s += degrau[j * colunas + uNa(a, b, j)];
    return s / n;
  };
  const forcaTotal = (a: number, b: number): number => {
    let s = 0;
    for (let j = 0; j < n; j++) s += forca[j * colunas + uNa(a, b, j)];
    return s;
  };
  // Parte dos pontos ao longo do lado com tinta entre a reta e a beira.
  const tintaFora = (a: number, b: number): number => {
    let comTinta = 0;
    for (let j = 0; j < n; j++) if (tinta[j * colunas + uNa(a, b, j)] > 0) comTinta++;
    return comTinta / n;
  };

  type Candidata = { a: number; b: number; apoio: number };
  const candidatas: Candidata[] = [];
  for (let a = minU; a <= D; a += 2) {
    for (let b = minU; b <= D; b += 2) {
      const ap = apoio(a, b);
      if (ap >= APOIO_MINIMO && tintaFora(a, b) <= TINTA_MAXIMA_FORA) candidatas.push({ a, b, apoio: ap });
    }
  }
  if (!candidatas.length) return naBeira;

  // A borda é a mais externa. O teste de degrau aceita retas até uns 8 px antes
  // dela, então, nesse grupo mais externo, vale a reta com o maior salto de brilho.
  const meio = (c: Candidata) => (c.a + c.b) / 2;
  const maisExterna = Math.min(...candidatas.map(meio));
  let melhor = candidatas[0];
  let melhorForca = -Infinity;
  for (const c of candidatas) {
    if (meio(c) > maisExterna + 10) continue;
    const f = forcaTotal(c.a, c.b);
    if (f > melhorForca) {
      melhor = c;
      melhorForca = f;
    }
  }
  // Ajuste fino de 1 px em volta da melhor.
  const grossa = melhor;
  for (let a = grossa.a - 1; a <= grossa.a + 1; a++) {
    for (let b = grossa.b - 1; b <= grossa.b + 1; b++) {
      if (a < minU || b < minU || a > D || b > D) continue;
      const f = forcaTotal(a, b);
      if (f > melhorForca && apoio(a, b) >= APOIO_MINIMO && tintaFora(a, b) <= TINTA_MAXIMA_FORA) {
        melhor = { a, b, apoio: apoio(a, b) };
        melhorForca = f;
      }
    }
  }
  return { p1: ponto(melhor.a, 0), p2: ponto(melhor.b, V - 1) };
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
