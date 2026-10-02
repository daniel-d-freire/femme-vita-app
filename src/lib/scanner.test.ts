import { describe, expect, it } from 'vitest';
import { clampCorners, escolherFolha, ordenarCantos, scaleCorners, type Corners } from './scanner';

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

describe('ordenarCantos', () => {
  it('ordena quatro pontos soltos em sentido horário a partir do canto superior esquerdo', () => {
    const pontos = [
      { x: 95, y: 182 },
      { x: 9, y: 21 },
      { x: 7, y: 176 },
      { x: 91, y: 19 },
    ];
    expect(ordenarCantos(pontos)).toEqual({
      topLeft: { x: 9, y: 21 },
      topRight: { x: 91, y: 19 },
      bottomRight: { x: 95, y: 182 },
      bottomLeft: { x: 7, y: 176 },
    });
  });

  it('funciona com o papel levemente girado', () => {
    const pontos = [
      { x: 20, y: 0 },
      { x: 120, y: 15 },
      { x: 105, y: 95 },
      { x: 5, y: 80 },
    ];
    const c = ordenarCantos(pontos);
    expect(c.topLeft).toEqual({ x: 20, y: 0 });
    expect(c.topRight).toEqual({ x: 120, y: 15 });
    expect(c.bottomRight).toEqual({ x: 105, y: 95 });
    expect(c.bottomLeft).toEqual({ x: 5, y: 80 });
  });
});

describe('escolherFolha', () => {
  const quad = (lado: number) => [
    { x: 0, y: 0 },
    { x: lado, y: 0 },
    { x: lado, y: lado },
    { x: 0, y: lado },
  ];

  it('fica com o maior candidato: a folha contém os quadros impressos', () => {
    const quadroImpresso = { quad: quad(60), area: 3600 };
    const folha = { quad: quad(90), area: 8100 };
    expect(escolherFolha([quadroImpresso, folha], 10000)).toBe(folha);
  });

  it('ignora candidato com menos de 20% da imagem', () => {
    expect(escolherFolha([{ quad: quad(40), area: 1600 }], 10000)).toBeNull();
  });

  it('sem candidatos devolve null', () => {
    expect(escolherFolha([], 10000)).toBeNull();
  });
});
