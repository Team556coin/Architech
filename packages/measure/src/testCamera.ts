/** A synthetic level pinhole camera used by tests to produce exact ground-truth projections. */
export interface TestCamera {
  width: number;
  height: number;
  focal: number;
  cameraHeight: number;
  horizonY: number;
}

export const camera: TestCamera = {
  width: 1500,
  height: 1000,
  focal: 1100,
  cameraHeight: 1.6,
  horizonY: 420,
};

/** Project a world point (X lateral, Y up, Z forward; meters) to normalized image coords. */
export function project(c: TestCamera, X: number, Y: number, Z: number) {
  const x = c.width / 2 + (c.focal * X) / Z;
  const y = c.horizonY + (c.focal * (c.cameraHeight - Y)) / Z;
  return { x: x / c.width, y: y / c.height };
}

export const ground = (c: TestCamera, X: number, Z: number) => project(c, X, 0, Z);
