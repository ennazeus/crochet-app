import { idbGetAll, idbRunTransaction } from "./db.js";
import { processImage } from "./utils.js";

/* blob <-> dataURL konverteringar */
function blobToDataUrl(blob) {

  return new Promise((resolve, reject) => {
    // Om blob är null eller undefined, returnera null direkt
    if (!blob) return resolve(null);

    // Skapa en FileReader för att läsa blob som dataURL
    const r = new FileReader();

    // När läsningen är klar, returnera dataURL:en
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    // Starta läsningen av blob som dataURL
    r.readAsDataURL(blob);
  });
}

/* dataURL -> Blob */
async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const res = await fetch(dataUrl);
  return await res.blob();
}

/* Funktion för att ladda ner ett JSON-objekt som en fil */
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // Skapa en temporär länk och klicka på den för att starta nedladdningen
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Rensa upp den temporära länken och URL-objektet efter nedladdningen
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export async function exportAll() {

  // --- HÄMTA ALLA MÖNSTER OCH PROGRESS FRÅN INDEXEDDB ---
  const patterns = await idbGetAll("patterns");
  const progress = await idbGetAll("progress");

  const patternsExport = [];

  // --- KONVERTERA ALLA MÖNSTER OCH DELAR TILL DATAURLS ---
  for (const p of patterns) {

    // --- Huvudbild ---
    let imageDataUrl = null;
    try {
      imageDataUrl = p.image ? await blobToDataUrl(p.image) : null;
    } catch (e) {
      console.warn("Failed to export image", e);
    }

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
        imageDataUrl: partImageDataUrl,
        imageMeta: part.imageMeta ?? null
      });
    }

    // Samla allt utom själva huvudbilden, parts och imageMeta i rest
    const { image, parts, imageMeta, ...rest } = p;

    // Inkludera huvudbilden som dataURL och de konverterade delarna i exporten
    patternsExport.push({
      ...rest,
      imageDataUrl,
      imageMeta: p.imageMeta ?? null,
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
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Filen kunde inte läsas. Den verkar vara skadad.");
  }

  if (!data || data.schema !== "crochet-app-backup") {
    throw new Error("Filen är inte en giltig backup.");
  }

  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const progress = Array.isArray(data.progress) ? data.progress : [];

  // Konvertera allt först (VIKTIGT – inget await i transaction)
  const convertedPatterns = [];

  for (const p of patterns) {

    if (!p.id) {
      console.warn("Hoppar över mönster utan id", p);
      continue;
    }

    let imageBlob = null;

    if (p.imageDataUrl) {
      imageBlob = await dataUrlToBlob(p.imageDataUrl);
    } else if (p.image) {
      const imageData = processImage(p.image);
      if (imageData) {
        imageBlob = await dataUrlToBlob(imageData);
      }
    }

    const partsImport = [];

    for (const part of (p.parts || [])) {



      let partImageBlob = null;

      if (part.imageDataUrl) {
        partImageBlob = await dataUrlToBlob(part.imageDataUrl);
      } else if (typeof part.image === "string") {
        const imageData = processImage(part.image);
        if (imageData) {
          partImageBlob = await dataUrlToBlob(imageData);
        }
      } else if (part.image instanceof Blob) {
        partImageBlob = part.image;
      }

      const { imageDataUrl, ...partRest } = part;

      partsImport.push({
        ...partRest,
        image: partImageBlob,
        imageMeta: part.imageMeta ?? null
      });
    }

    const { imageDataUrl, parts, ...rest } = p;

    convertedPatterns.push({
      ...rest,
      image: imageBlob,
      imageMeta: p.imageMeta ?? null,
      parts: partsImport
    });
  }

  const patternIds = new Set(convertedPatterns.map(p => p.id));
  const progressToImport = progress.filter(
    pr => pr?.patternId && patternIds.has(pr.patternId)
  );

  // Kör EN atomisk transaction
  await idbRunTransaction(
    ["patterns", "progress"],
    "readwrite",
    (stores) => {
      const { patterns: patternsStore, progress: progressStore } = stores;

      // Riktig restore = rensa först
      patternsStore.clear();
      progressStore.clear();

      for (const p of convertedPatterns) {
        patternsStore.put(p);
      }

      for (const pr of progressToImport) {
        progressStore.put(pr);
      }
    }
  );
  
  return {
    patternsImported: convertedPatterns.length,
    progressImported: progressToImport.length
  };
}

/*export async function importAllFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data || data.schema !== "crochet-app-backup") {
    throw new Error("Fel filformat");
  }

  if (data.version !== 2) {
    console.warn("Importing older backup version:", data.version);
  }

  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const progress = Array.isArray(data.progress) ? data.progress : [];

  const db = await getDb();

  for (const p of patterns) {

    // --- HUVUDBILD ---
    let imageBlob = null;

    // Bakomåtkompatibilitet: Först kollar vi om det finns en imageDataUrl (nytt format), 
    // annars kollar vi om det finns en image som är base64 (gammalt format)
    if (p.imageDataUrl) {
      imageBlob = await dataUrlToBlob(p.imageDataUrl);
    } else if (p.image) {
      // gammal backup där image redan är base64
      const imageData = processImage(p.image);
      if (imageData) {
        imageBlob = await dataUrlToBlob(imageData);
      } 
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
        // Validera att det är en giltig data URL innan konvertering
        const imageData = processImage(part.image);
        if (imageData) {
          partImageBlob = await dataUrlToBlob(imageData);
        }
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
}*/