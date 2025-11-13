/**
 * Graphics Geometry Utilities
 * @module utils/graphics-geometry
 *
 * Provides geometry and math helpers specifically for graphics rendering:
 * - Point validation and transformations
 * - Vector operations (normalize, perpendicular, translate)
 * - Angle calculations and conversions
 */

/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x: number, y: number}} Vector */

// ============================================================================
// POINT VALIDATION
// ============================================================================

/**
 * Check if a point has finite x and y coordinates
 * @param {*} p - Potential point object
 * @returns {boolean} True if p is a valid point with finite coordinates
 */
export function isFinitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

/**
 * Normalize a vector to unit length
 * @param {number} vx - X component of vector
 * @param {number} vy - Y component of vector
 * @returns {Vector} Normalized unit vector
 */
export function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (!len) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

/**
 * Get perpendicular vector (90° counterclockwise rotation)
 * @param {Vector} v - Input vector
 * @returns {Vector} Perpendicular vector
 */
export function perp(v) {
  return { x: -v.y, y: v.x };
}

/**
 * Translate a point along a direction by a distance
 * @param {Point} pt - Starting point
 * @param {Vector} dir - Direction vector (will be normalized)
 * @param {number} dist - Distance to translate
 * @returns {Point|null} Translated point, or null if input invalid
 */
export function translate(pt, dir, dist) {
  if (!isFinitePoint(pt)) return null;
  const n = normalize(dir.x, dir.y);
  return { x: pt.x + n.x * dist, y: pt.y + n.y * dist };
}

// ============================================================================
// ANGLE OPERATIONS
// ============================================================================

/**
 * Keep angle visually upright for text rendering
 * Maps angle to range [-π/2, π/2] for readable text orientation
 * @param {number} theta - Input angle in radians
 * @returns {number} Upright angle in radians
 */
export function uprightAngle(theta) {
  if (theta > Math.PI / 2 || theta < -Math.PI / 2) {
    return theta + Math.PI;
  }
  return theta;
}

/**
 * Calculate angle from point o to point p
 * @param {Point} p - Target point
 * @param {Point} o - Origin point
 * @returns {number} Angle in radians
 */
export function angleOf(p, o) {
  return Math.atan2(p.y - o.y, p.x - o.x);
}

/**
 * Calculate smallest signed angle difference from a to b
 * @param {number} a - Start angle in radians
 * @param {number} b - End angle in radians
 * @returns {number} Angle delta in radians, range [-π, π]
 */
export function angleDelta(a, b) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Get a point on a ray from origin at given angle and distance
 * @param {Point} origin - Ray origin
 * @param {number} angle - Ray angle in radians
 * @param {number} dist - Distance along ray
 * @returns {Point} Point on ray
 */
export function pointOnRay(origin, angle, dist) {
  return {
    x: origin.x + Math.cos(angle) * dist,
    y: origin.y + Math.sin(angle) * dist,
  };
}

// ============================================================================
// ORIENTATION RESOLUTION
// ============================================================================

/**
 * Resolve an orientation descriptor to a unit vector
 *
 * Supports multiple descriptor types:
 * - "perpendicular": perpendicular to baseDir
 * - "parallel": parallel to baseDir
 * - "horizontal": horizontal direction (1, 0)
 * - "vertical": vertical direction (0, 1)
 * - number: angle in radians
 * - {x, y}: explicit vector (will be normalized)
 *
 * @param {string|number|Vector} descriptor - Orientation descriptor
 * @param {Vector} baseDir - Base direction vector for relative orientations
 * @returns {Vector} Resolved unit direction vector
 */
export function resolveOrientation(descriptor, baseDir) {
  if (!descriptor || descriptor === "perpendicular") {
    return perp(baseDir);
  }
  if (descriptor === "parallel") {
    return normalize(baseDir.x, baseDir.y);
  }
  if (descriptor === "horizontal") {
    return { x: 1, y: 0 };
  }
  if (descriptor === "vertical") {
    return { x: 0, y: 1 };
  }
  if (typeof descriptor === "number") {
    return { x: Math.cos(descriptor), y: Math.sin(descriptor) };
  }
  if (
    typeof descriptor === "object" &&
    Number.isFinite(descriptor.x) &&
    Number.isFinite(descriptor.y)
  ) {
    return normalize(descriptor.x, descriptor.y);
  }
  // Default fallback: perpendicular
  return perp(baseDir);
}
