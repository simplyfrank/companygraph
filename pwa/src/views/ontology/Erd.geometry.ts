/**
 * ERD geometry utilities
 * Helper functions for calculating positions, intersections, and layout
 */

import type { ErdPosition, ErdSize } from "./Erd.types";

/** Calculate the center point of a rectangle */
export function rectCenter(pos: ErdPosition, size: ErdSize): ErdPosition {
  return {
    x: pos.x + size.width / 2,
    y: pos.y + size.height / 2,
  };
}

/** Calculate the distance between two points */
export function distance(a: ErdPosition, b: ErdPosition): number {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

/** Check if a point is inside a rectangle */
export function pointInRect(point: ErdPosition, pos: ErdPosition, size: ErdSize): boolean {
  return (
    point.x >= pos.x &&
    point.x <= pos.x + size.width &&
    point.y >= pos.y &&
    point.y <= pos.y + size.height
  );
}

/** Check if two rectangles intersect */
export function rectIntersect(
  pos1: ErdPosition,
  size1: ErdSize,
  pos2: ErdPosition,
  size2: ErdSize
): boolean {
  return (
    pos1.x < pos2.x + size2.width &&
    pos1.x + size1.width > pos2.x &&
    pos1.y < pos2.y + size2.height &&
    pos1.y + size1.height > pos2.y
  );
}

/** Calculate the intersection point of a line from center to center with rectangle bounds */
export function lineRectIntersection(
  from: ErdPosition,
  to: ErdPosition,
  pos: ErdPosition,
  size: ErdSize
): ErdPosition | null {
  const center = rectCenter(pos, size);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) return center;

  // Parameter t for line equation: P = from + t * (to - from)
  // Find t where line intersects each edge of the rectangle
  const tValues: number[] = [];

  // Left edge
  if (dx !== 0) {
    const t = (pos.x - from.x) / dx;
    if (t >= 0 && t <= 1) {
      const y = from.y + t * dy;
      if (y >= pos.y && y <= pos.y + size.height) {
        tValues.push(t);
      }
    }
  }

  // Right edge
  if (dx !== 0) {
    const t = (pos.x + size.width - from.x) / dx;
    if (t >= 0 && t <= 1) {
      const y = from.y + t * dy;
      if (y >= pos.y && y <= pos.y + size.height) {
        tValues.push(t);
      }
    }
  }

  // Top edge
  if (dy !== 0) {
    const t = (pos.y - from.y) / dy;
    if (t >= 0 && t <= 1) {
      const x = from.x + t * dx;
      if (x >= pos.x && x <= pos.x + size.width) {
        tValues.push(t);
      }
    }
  }

  // Bottom edge
  if (dy !== 0) {
    const t = (pos.y + size.height - from.y) / dy;
    if (t >= 0 && t <= 1) {
      const x = from.x + t * dx;
      if (x >= pos.x && x <= pos.x + size.width) {
        tValues.push(t);
      }
    }
  }

  if (tValues.length === 0) return null;

  // Return the intersection point with the smallest t (closest to from)
  const t = Math.min(...tValues);
  return {
    x: from.x + t * dx,
    y: from.y + t * dy,
  };
}

/** Calculate control points for a bezier curve between two rectangles */
export function bezierControlPoints(
  from: ErdPosition,
  fromSize: ErdSize,
  to: ErdPosition,
  toSize: ErdSize,
  curvature: number = 0.5
): { cp1: ErdPosition; cp2: ErdPosition } {
  const fromCenter = rectCenter(from, fromSize);
  const toCenter = rectCenter(to, toSize);
  const midX = (fromCenter.x + toCenter.x) / 2;
  const midY = (fromCenter.y + toCenter.y) / 2;

  // Determine if connection is mostly horizontal or vertical
  const isHorizontal = Math.abs(toCenter.x - fromCenter.x) > Math.abs(toCenter.y - fromCenter.y);

  if (isHorizontal) {
    return {
      cp1: { x: midX, y: fromCenter.y },
      cp2: { x: midX, y: toCenter.y },
    };
  } else {
    return {
      cp1: { x: fromCenter.x, y: midY },
      cp2: { x: toCenter.x, y: midY },
    };
  }
}

/** Generate a self-loop curve for a node */
export function selfLoopCurve(
  pos: ErdPosition,
  size: ErdSize,
  side: 'right' | 'left' | 'top' | 'bottom' = 'right'
): { start: ErdPosition; end: ErdPosition; cp1: ErdPosition; cp2: ErdPosition } {
  const center = rectCenter(pos, size);
  const offset = Math.max(size.width, size.height) * 0.6;

  switch (side) {
    case 'right':
      return {
        start: { x: pos.x + size.width, y: pos.y + size.height * 0.3 },
        end: { x: pos.x + size.width, y: pos.y + size.height * 0.7 },
        cp1: { x: center.x + offset, y: pos.y - offset * 0.3 },
        cp2: { x: center.x + offset, y: pos.y + size.height + offset * 0.3 },
      };
    case 'left':
      return {
        start: { x: pos.x, y: pos.y + size.height * 0.7 },
        end: { x: pos.x, y: pos.y + size.height * 0.3 },
        cp1: { x: center.x - offset, y: pos.y + size.height + offset * 0.3 },
        cp2: { x: center.x - offset, y: pos.y - offset * 0.3 },
      };
    case 'top':
      return {
        start: { x: pos.x + size.width * 0.7, y: pos.y },
        end: { x: pos.x + size.width * 0.3, y: pos.y },
        cp1: { x: pos.x + size.width + offset * 0.3, y: center.y - offset },
        cp2: { x: pos.x - offset * 0.3, y: center.y - offset },
      };
    case 'bottom':
      return {
        start: { x: pos.x + size.width * 0.3, y: pos.y + size.height },
        end: { x: pos.x + size.width * 0.7, y: pos.y + size.height },
        cp1: { x: pos.x - offset * 0.3, y: center.y + offset },
        cp2: { x: pos.x + size.width + offset * 0.3, y: center.y + offset },
      };
  }
}

/** Calculate the bounding box of a set of positions */
export function boundingBox(positions: ErdPosition[]): {
  min: ErdPosition;
  max: ErdPosition;
  size: ErdSize;
} {
  if (positions.length === 0) {
    return {
      min: { x: 0, y: 0 },
      max: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
    };
  }

  const minX = Math.min(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxX = Math.max(...positions.map(p => p.x));
  const maxY = Math.max(...positions.map(p => p.y));

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    size: { width: maxX - minX, height: maxY - minY },
  };
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Snap a position to a grid */
export function snapToGrid(
  pos: ErdPosition,
  gridSize: number = 20
): ErdPosition {
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize,
  };
}
