export async function imageFileToResizedBlob(file, {
  maxWidth = 480,
  maxHeight = 480,
  mimeType = "image/jpeg",
  quality = 0.82
} = {}) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;

    const scale = Math.min(1, maxWidth / w0, maxHeight / h0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
    return { blob, meta: { type: mimeType, width: w, height: h } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);

    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const res = await fetch(dataUrl);
  return res.blob();
}

export function processImage(imageData) {
  // Validate that image is a base64 string
  if (!imageData || !isValidBase64(imageData)) {
    console.warn('Invalid or missing image data, using placeholder');
    return null; // or return a default placeholder image
  }
  return imageData;
}