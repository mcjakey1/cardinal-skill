import { boundsOf, type Bounds, type Point, type Transform, type Viewport } from './chartViewport.ts';

export interface MiniMapGeometry {
  bounds: Bounds;
  scale: number;
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
}

export interface MiniMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function miniMapGeometry(
  points: readonly Point[],
  width: number,
  height: number,
  pad = 0,
): MiniMapGeometry {
  const bounds = boundsOf(points, pad);
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const contentWidth = worldWidth * scale;
  const contentHeight = worldHeight * scale;
  return {
    bounds,
    scale,
    contentWidth,
    contentHeight,
    offsetX: (width - contentWidth) / 2,
    offsetY: (height - contentHeight) / 2,
  };
}

export function projectToMiniMap(point: Point, geometry: MiniMapGeometry): Point {
  return {
    x: geometry.offsetX + (point.x - geometry.bounds.minX) * geometry.scale,
    y: geometry.offsetY + (point.y - geometry.bounds.minY) * geometry.scale,
  };
}

/** Camera viewport projected into the same letterboxed coordinate system as the nodes. */
export function miniMapFrustum(
  transform: Transform,
  viewport: Viewport,
  geometry: MiniMapGeometry,
): MiniMapRect {
  const cameraScale = transform.scale > 0 ? transform.scale : 1;
  const topLeft = projectToMiniMap(
    { x: -transform.x / cameraScale, y: -transform.y / cameraScale },
    geometry,
  );
  const bottomRight = projectToMiniMap(
    {
      x: (viewport.width - transform.x) / cameraScale,
      y: (viewport.height - transform.y) / cameraScale,
    },
    geometry,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(2, bottomRight.x - topLeft.x),
    height: Math.max(2, bottomRight.y - topLeft.y),
  };
}
