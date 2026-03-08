// js/utils.js

/** Aktuell backup-version */
export const CURRENT_BACKUP_VERSION = 2;

/** Aktuell app-version */
export const APP_VERSION = "1.0";



export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

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

export function downloadJson(obj, filename) {
  const blob = new Blob(
    [JSON.stringify(obj, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

