/**
 * Geometric computation utilities
 * @module utils/geometry
 */

/** @typedef {{x: number, y: number}} Point */
/** @typedef {{center: Point, radius: number}} Circle */

const EPSILON = 1e-3;

/**
 * Calculate Euclidean distance between two points
 * @param {Point} a - First point
 * @param {Point} b - Second point
 * @returns {number} Distance in pixels
 */
export function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Create a circle from two points (diameter)
 * @param {Point} p1 - First point
 * @param {Point} p2 - Second point
 * @returns {Circle} Circle with center at midpoint
 */
export function circleFromTwoPoints(p1, p2) {
  return {
    center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    radius: distanceBetweenPoints(p1, p2) / 2,
  };
}

/**
 * Create a circle passing through three points (circumcircle)
 * @param {Point} p1 - First point
 * @param {Point} p2 - Second point
 * @param {Point} p3 - Third point
 * @returns {Circle|null} Circumcircle or null if points are collinear
 */
export function circleFromThreePoints(p1, p2, p3) {
  const d =
    2 *
    (p1.x * (p2.y - p3.y) +
      p2.x * (p3.y - p1.y) +
      p3.x * (p1.y - p2.y));
  if (Math.abs(d) < EPSILON) return null;

  const ux =
    ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) +
      (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) +
      (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) /
    d;
  const uy =
    ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) +
      (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) +
      (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) /
    d;
  const center = { x: ux, y: uy };
  return {
    center,
    radius: distanceBetweenPoints(center, p1),
  };
}

/**
 * Check if a point is inside or on a circle
 * @param {Point} point - Point to test
 * @param {Circle|null} circle - Circle to test against
 * @returns {boolean} True if point is inside or on circle boundary
 */
export function isPointInsideCircle(point, circle) {
  if (!circle) return false;
  return distanceBetweenPoints(point, circle.center) <= circle.radius + EPSILON;
}

/**
 * Compute the minimum enclosing circle for a set of points using Welzl's algorithm
 * @param {Point[]} points - Array of points
 * @returns {Circle|null} Minimum enclosing circle or null if no points
 */
export function minEnclosingCircle(points) {
  if (!points?.length) return null;
  let circle = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (circle && isPointInsideCircle(p, circle)) continue;

    circle = { center: { ...p }, radius: 0 };
    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (isPointInsideCircle(q, circle)) continue;

      circle = circleFromTwoPoints(p, q);
      for (let k = 0; k < j; k++) {
        const r = points[k];
        if (isPointInsideCircle(r, circle)) continue;

        const candidate = circleFromThreePoints(p, q, r);
        if (candidate) circle = candidate;
      }
    }
  }
  return circle;
}
