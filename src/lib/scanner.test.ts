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
