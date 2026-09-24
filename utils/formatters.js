/**
 * Formatting utilities for measurements and display values
 * @module utils/formatters
 */

/**
 * Format a millimeter value for display
 * @param {number|null|undefined} v - Value in millimeters
 * @returns {string} Formatted string (e.g., "12.5 mm" or "--")
 */
export function formatMm(v) {
  return v == null || !Number.isFinite(v) ? "--" : `${v.toFixed(1)} mm`;
}

/**
 * Format a degree value for display
 * @param {number|null|undefined} v - Value in degrees
 * @returns {string} Formatted string (e.g., "45.2°" or "--")
 */
export function formatDeg(v) {
  return v == null || !Number.isFinite(v) ? "--" : `${v.toFixed(1)}°`;
}

/**
 * Format a centimeter value for display
 * @param {number|null|undefined} v - Value in centimeters
 * @returns {string} Formatted string (e.g., "25.3 cm" or "--")
 */
export function formatCm(v) {
  return v == null || !Number.isFinite(v) ? "--" : `${v.toFixed(1)} cm`;
}
