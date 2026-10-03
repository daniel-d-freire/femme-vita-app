import { describe, expect, it } from 'vitest';
import { acharFolha, clampCorners, scaleCorners, type Corners } from './scanner';

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

/** Imagem em tons de cinza: fundo, folha mais clara e o que mais for pintado. */
function imagem(W: number, H: number, fundo: number) {
  const px = new Uint8Array(W * H).fill(fundo);
  const ret = (x0: number, y0: number, x1: number, y1: number, tom: number) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) px[y * W + x] = tom;
  };
  return { px, ret };
}

const perto = (c: Corners, esperado: [number, number][], tol = 3) => {
  const pts = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  pts.forEach((p, i) => {
    expect(Math.abs(p.x - esperado[i][0]), `x do canto ${i}`).toBeLessThanOrEqual(tol);
    expect(Math.abs(p.y - esperado[i][1]), `y do canto ${i}`).toBeLessThanOrEqual(tol);
  });
};

/** Guia impressa: quadros finos escuros e uma faixa cinza, como a SP/SADT. */
function guiaImpressa(ret: (x0: number, y0: number, x1: number, y1: number, tom: number) => void, x0: number, y0: number, x1: number, y1: number) {
  ret(x0, y0, x1, y1, 200);
  ret(x0 + 25, y0 + 25, x0 + 27, y1 - 25, 40); // linha impressa vertical
  ret(x0 + 25, y0 + 25, x1 - 25, y0 + 27, 40); // linha impressa horizontal
  ret(x0 + 40, y0 + 40, x0 + 55, y1 - 40, 150); // faixa cinza
}

describe('acharFolha', () => {
  it('acha as quatro bordas da folha sobre a mesa, sem parar nos quadros impressos', () => {
    const W = 300, H = 400;
    const { px, ret } = imagem(W, H, 110);
    guiaImpressa(ret, 20, 15, 285, 388);
    perto(acharFolha(px, W, H), [[20, 15], [285, 15], [285, 388], [20, 388]]);
  });

  it('folha passando da foto: o lado fica na beira, não corta a guia', () => {
    const W = 300, H = 400;
    const { px, ret } = imagem(W, H, 110);
    guiaImpressa(ret, -10, -10, 285, 410); // só a borda direita aparece
    perto(acharFolha(px, W, H), [[0, 0], [285, 0], [285, H - 1], [0, H - 1]]);
  });

  it('acha a borda mesmo com uma faixa de mesa mais clara depois da sombra', () => {
    const W = 300, H = 400;
    const { px, ret } = imagem(W, H, 170); // azulejo claro
    ret(0, 0, 22, H, 105); // sombra escura junto da folha
    guiaImpressa(ret, 22, -10, 310, 410);
    perto(acharFolha(px, W, H), [[22, 0], [W - 1, 0], [W - 1, H - 1], [22, H - 1]]);
  });

  it('folha inclinada: as bordas seguem a inclinação', () => {
    const W = 300, H = 400;
    const px = new Uint8Array(W * H).fill(100);
    // folha de (30,20)-(280,25)-(275,385)-(25,380): borda esquerda vai de x=30 a x=25
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const esq = 30 - (5 * y) / H, dir = 280 - (5 * y) / H;
        const topo = 20 + (5 * x) / W, base = 380 + (5 * x) / W;
        if (x >= esq && x < dir && y >= topo && y < base) px[y * W + x] = 205;
      }
    perto(acharFolha(px, W, H), [[30, 20], [280, 25], [275, 385], [25, 380]], 4);
  });

  it('rejunte e manchas do azulejo fora da folha não escondem a borda', () => {
    const W = 300, H = 400;
    const { px, ret } = imagem(W, H, 150); // azulejo
    for (let y = 10; y < H; y += 23) ret(0, y, 30, y + 2, 105); // rejuntes
    for (let k = 0; k < 40; k++) ret((k * 7) % 25, (k * 37) % H, ((k * 7) % 25) + 2, ((k * 37) % H) + 2, 110); // manchas
    guiaImpressa(ret, 30, -10, 310, 410);
    perto(acharFolha(px, W, H), [[30, 0], [W - 1, 0], [W - 1, H - 1], [30, H - 1]]);
  });

  it('letra miúda perto da beira e faixa cinza mais para dentro: não corta (fica na beira)', () => {
    const W = 300, H = 400;
    const { px, ret } = imagem(W, H, 200); // a folha enche a foto
    for (let x = 5; x < W - 5; x += 6) ret(x, 388, x + 1, 393, 60); // rodapé: letras finas
    ret(0, 340, W, 360, 150); // faixa cinza: de baixo para cima, cinza → branco
    perto(acharFolha(px, W, H), [[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]]);
  });
});
