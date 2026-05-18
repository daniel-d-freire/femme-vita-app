/**
 * Document scanner: detects paper edges, rectifies perspective, applies B&W
 * "scanner" filter. Uses OpenCV.js bundled as a static asset in /public.
 */

const OPENCV_URL = '/opencv.js';

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

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    img.src = dataUrl;
  });
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Detects the most prominent quadrilateral (the paper) in the image and
 * returns its 4 corners ordered as { topLeft, topRight, bottomRight, bottomLeft }.
 * Returns null when no convincing paper-like contour was found.
 */
export async function detectPaperCorners(dataUrl: string): Promise<Corners | null> {
  await loadOpenCV();
  const img = await loadImage(dataUrl);
  const srcMat: CvAny = cv.imread(img);

  const gray: CvAny = new cv.Mat();
  const edges: CvAny = new cv.Mat();
  const blurred: CvAny = new cv.Mat();
  const thresh: CvAny = new cv.Mat();
  const contours: CvAny = new cv.MatVector();
  const hierarchy: CvAny = new cv.Mat();

  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, 50, 200);
    cv.GaussianBlur(edges, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_OTSU);
    cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = srcMat.cols * srcMat.rows;
    let maxArea = 0;
    let maxIdx = -1;
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) {
        maxArea = area;
        maxIdx = i;
      }
    }

    if (maxIdx < 0 || maxArea < imgArea * 0.1) {
      // Less than 10% of the image — not a paper.
      return null;
    }

    const contour: CvAny = contours.get(maxIdx);
    return cornersFromContour(contour, srcMat);
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

function cornersFromContour(contour: CvAny, srcMat: CvAny): Corners | null {
  // Use bounding rotated rect center as reference, then pick the contour
  // point farthest from center in each quadrant — those are our corners.
  const rect = cv.minAreaRect(contour);
  const cx = rect.center.x;
  const cy = rect.center.y;

  let tl: Point | null = null;
  let tr: Point | null = null;
  let bl: Point | null = null;
  let br: Point | null = null;
  let tlD = 0, trD = 0, blD = 0, brD = 0;
  const data: Int32Array = contour.data32S;

  for (let i = 0; i < data.length; i += 2) {
    const p: Point = { x: data[i], y: data[i + 1] };
    const d = distance(p, { x: cx, y: cy });
    if (p.x < cx && p.y < cy && d > tlD) { tl = p; tlD = d; }
    else if (p.x > cx && p.y < cy && d > trD) { tr = p; trD = d; }
    else if (p.x < cx && p.y > cy && d > blD) { bl = p; blD = d; }
    else if (p.x > cx && p.y > cy && d > brD) { br = p; brD = d; }
  }

  if (!tl || !tr || !bl || !br) {
    // Fallback: image corners
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: srcMat.cols, y: 0 },
      bottomRight: { x: srcMat.cols, y: srcMat.rows },
      bottomLeft: { x: 0, y: srcMat.rows },
    };
  }
  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
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
  const outW = Math.max(Math.round((widthTop + widthBottom) / 2), 800);
  const outH = Math.max(Math.round((heightLeft + heightRight) / 2), 800);

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
  cv.warpPerspective(srcMat, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

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
  return canvas.toDataURL('image/jpeg', 0.92);
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
 * mirrors the input (PNG stays PNG, anything else becomes JPEG q=0.92).
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
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
}
