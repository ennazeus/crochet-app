// js/utils.js

/** HTML-escape för textinnehåll */
export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Escape för attribut (src, data-*, id osv) */
export function escapeAttr(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Gör en sträng “safe-ish” för id/class-delar */
export function cssSafe(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** querySelector helper */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** querySelectorAll helper -> array */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function isValidBase64(str) {
  if (typeof str !== 'string') return false;
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

export function processImage(imageData) {
  // Validate that image is a base64 string
  if (!imageData || !isValidBase64(imageData)) {
    console.warn('Invalid or missing image data, using placeholder');
    return null; // or return a default placeholder image
  }
  return imageData;
}