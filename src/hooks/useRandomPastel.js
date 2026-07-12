// src/hooks/useRandomPastel.js
// Pastel palette generator with stable hashing and useful tokens.

export function hashKey(key = "default") {
  // djb2-ish, stable for strings
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) + key.charCodeAt(i); // hash * 33 + c
  }
  return Math.abs(hash);
}

// Base hues for calm, professional pastels (sky/teal/apricot/lilac/rose)
const HUES = [200, 160, 40, 280, 340];

function paletteFromHue(h) {
  // Keep saturation moderate and lightness high; provide consistent tokens
  const cardBg = `hsl(${h}, 60%, 96%)`;   // very light tint for cards
  const chipBg = `hsl(${h}, 65%, 92%)`;   // slightly stronger for chips
  const border = `hsl(${h}, 45%, 80%)`;   // soft border
  const text  = `hsl(${h}, 35%, 28%)`;    // readable on light tints
  return { cardBg, chipBg, border, text, hue: h };
}

/**
 * useRandomPastel(key)
 * Returns a palette object: { cardBg, chipBg, border, text, hue }
 * based on a stable hash of the provided key (e.g., student id).
 */
export default function useRandomPastel(key) {
  const hv = HUES[hashKey(String(key || "default")) % HUES.length];
  return paletteFromHue(hv);
}
