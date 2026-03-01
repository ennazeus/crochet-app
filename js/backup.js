import { idbGetAll, idbPut } from "./db.js";

console.log("backup.js laddad");

/* blob <-> dataURL konverteringar */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* dataURL -> Blob */
async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const res = await fetch(dataUrl);
  return await res.blob();
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // Skapa en temporär länk och klicka på den för att starta nedladdningen
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Frigör minnet som används av blob-URL:en
  URL.revokeObjectURL(url);
}

export async function exportAll() {
  const patterns = await idbGetAll("patterns");
  const progress = await idbGetAll("progress");

  const patternsExport = [];

  // --- KONVERTERA ALLA MÖNSTER OCH DELAR TILL DATAURLS ---
  for (const p of patterns) {

    // --- Huvudbild ---
    const imageDataUrl = p.image ? await blobToDataUrl(p.image) : null;

    // --- DELBILDER ---
    const partsExport = [];

    // För varje del, konvertera bilden till dataURL (om den finns) och inkludera den i exporten
    for (const part of (p.parts || [])) {
      const partImageDataUrl = part.image
        ? await blobToDataUrl(part.image)
        : null;

      // Samla allt utom själva bilden i partRest
      const { image, ...partRest } = part;

      // Inkludera även eventuell imageMeta i exporten
      partsExport.push({
        ...partRest,
        imageDataUrl: partImageDataUrl
      });
    }

    // Samla allt utom själva huvudbilden och parts i rest
    const { image, parts, ...rest } = p;

    // Inkludera huvudbilden som dataURL och de konverterade delarna i exporten
    patternsExport.push({
      ...rest,
      imageDataUrl,
      parts: partsExport
    });
  }

  // --- SKAPA EXPORTOBJEKT OCH LADDA NER ---
  const exportObj = {
    schema: "crochet-app-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    patterns: patternsExport,
    progress
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJson(exportObj, `crochet-app-backup-${ts}.json`);
}

export async function importAllFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data || data.schema !== "crochet-app-backup") {
    throw new Error("Fel filformat");
  }

  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const progress = Array.isArray(data.progress) ? data.progress : [];

  for (const p of patterns) {

    // --- HUVUDBILD ---
    let imageBlob = null;

    // Bakomåtkompatibilitet: Först kollar vi om det finns en imageDataUrl (nytt format), 
    // annars kollar vi om det finns en image som är base64 (gammalt format)
    if (p.imageDataUrl) {
      imageBlob = await dataUrlToBlob(p.imageDataUrl);
    } else if (p.image) {
      // gammal backup där image redan är base64
      imageBlob = await dataUrlToBlob(p.image);
    }

    // --- DELAR ---
    const partsImport = [];

    // För varje del, konvertera dataURL (om den finns) tillbaka till Blob och inkludera den i importen
    for (const part of (p.parts || [])) {

      let partImageBlob = null;

      // Samma bakåtkompatibilitet för delbilder: kolla först imageDataUrl, 
      // sedan image som base64, och till sist om det redan är en Blob (äldre version)
      if (part.imageDataUrl) {
        partImageBlob = await dataUrlToBlob(part.imageDataUrl);
      } else if (typeof part.image === "string") {
        // gammal backup där image är base64-sträng
        partImageBlob = await dataUrlToBlob(part.image);
      } else if (part.image instanceof Blob) {
        // om det redan råkar vara blob (äldre version)
        partImageBlob = part.image;
      }
      
      // Samla allt utom själva bilden i partRest
      const { imageDataUrl, ...partRest } = part;

      // Inkludera även eventuell imageMeta i importen
      partsImport.push({
        ...partRest,
        image: partImageBlob,
        imageMeta: part.imageMeta ?? null
      });
    }

    // Samla allt utom själva huvudbilden och parts i rest
    const { imageDataUrl, parts, ...rest } = p;

    // Inkludera huvudbilden som Blob och de konverterade delarna i importen
    await idbPut("patterns", {
      ...rest,
      image: imageBlob,
      imageMeta: p.imageMeta ?? null,
      parts: partsImport
    });
  }

  // --- IMPORTERA PROGRESS ---
  for (const pr of progress) {
    if (pr?.patternId) {
      await idbPut("progress", pr);
    }
  }

  // --- RETURNERA ANTAL IMPORTERADE MÖNSTER OCH PROGRESS ---
  return {
    patternsImported: patterns.length,
    progressImported: progress.length
  };
}