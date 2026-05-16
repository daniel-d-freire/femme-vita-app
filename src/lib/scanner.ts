/**
 * Document scanner: detects paper edges, rectifies perspective, applies B&W
 * "scanner" filter. Uses OpenCV.js loaded dynamically from CDN — first call
 * incurs an ~8MB download (cached afterwards by the browser).
 */

const OPENCV_URL = 'https://docs.opencv.org/4.x/opencv.js';

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
  let extras: CvAny[] = [];
  if (filter === 'bw') {
    const gray: CvAny = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    const bw: CvAny = new cv.Mat();
    // Adaptive threshold gives a scanner look that handles uneven lighting.
    cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 10);
    final = bw;
    extras = [gray];
  } else if (filter === 'gray') {
    const gray: CvAny = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    final = gray;
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
  if (filter !== 'color') final.delete();

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
