import { idbGetAll, idbRunTransaction } from "./db.js";
import { processImage, blobToDataUrl, dataUrlToBlob } from "./image.js";
import { slugify, shareJson, downloadJson, migrateBackup, CURRENT_BACKUP_VERSION, APP_VERSION} from "./utils.js";

async function exportPart(part) {
  const partImageDataUrl = part.image
    ? await blobToDataUrl(part.image)
    : null;

  const { image, ...rest } = part;

  return {
    ...rest,
    imageDataUrl: partImageDataUrl,
    imageMeta: part.imageMeta ?? null
  };
}

async function exportPattern(pattern) {

  const imageDataUrl = pattern.image
    ? await blobToDataUrl(pattern.image)
    : null;

  const parts = await Promise.all(
    (pattern.parts || []).map(part => exportPart(part))
  );

  const { image, parts: _, ...rest } = pattern;

  return {
    ...rest,
    imageDataUrl,
    imageMeta: pattern.imageMeta ?? null,
    parts
  };
}

export async function exportSinglePattern(patternId) {

  const patterns = await idbGetAll("patterns");

  const pattern = patterns.find(p => p.id === patternId);

  if (!pattern) {
    throw new Error("Mönstret kunde inte hittas.");
  }

  const patternExport = await exportPattern(pattern);

  const exportObj = {
    schema: "crochet-app-pattern",
    version: CURRENT_BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    patternName: pattern.name ?? "Pattern",
    patternId: pattern.id,
    pattern: patternExport
  };

  const safeName = pattern.name ? slugify(pattern.name) : "pattern";
  const filename = `crochet-pattern-${safeName}.json`;

  return {
    obj: exportObj,
    filename
  };
}

export async function exportAll() {

  const patterns = await idbGetAll("patterns");
  const progress = await idbGetAll("progress");

  const patternsExport = await Promise.all(
    patterns.map(p => exportPattern(p))
  );

  const exportObj = {
    schema: "crochet-app-backup",
    version: CURRENT_BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    patterns: patternsExport,
    progress
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  downloadJson(exportObj, `crochet-app-backup-${ts}.json`);
}

export async function previewImportFile(file) {

  const text = await file.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Filen kunde inte läsas.");
  }

  if (!data || !data.schema) {
    throw new Error("Filen är inte en giltig backup.");
  }

  if (data.schema === "crochet-app-pattern") {
    return {
      type: "pattern",
      name: data.patternName ?? "Pattern"
    };
  }

  if (data.schema === "crochet-app-backup") {
    return {
      type: "backup",
      patternCount: Array.isArray(data.patterns) ? data.patterns.length : 0
    };
  }

  throw new Error("Okänt filformat.");
}

async function importPart(part) {

  let imageBlob = null;

  if (part.imageDataUrl) {
    try {
      imageBlob = await dataUrlToBlob(part.imageDataUrl);
    } catch {
      console.warn("Kunde inte läsa bild i backup", part);
    }
  } else if (typeof part.image === "string") {
    const imageData = processImage(part.image);
    if (imageData) imageBlob = await dataUrlToBlob(imageData);
  } else if (part.image instanceof Blob) {
    imageBlob = part.image;
  }

  const { imageDataUrl, ...rest } = part;

  return {
    ...rest,
    image: imageBlob,
    imageMeta: part.imageMeta ?? null
  };
}

async function importPattern(p) {

  if (!p.id) {
    console.warn("Hoppar över mönster utan id", p);
    return null;
  }

  let imageBlob = null;

  if (p.imageDataUrl) {
    try {
      imageBlob = await dataUrlToBlob(p.imageDataUrl);
    } catch {
      console.warn("Kunde inte läsa bild i backup", p);
    }
  } else if (p.image) {
    const imageData = processImage(p.image);
    if (imageData) imageBlob = await dataUrlToBlob(imageData);
  }

  const parts = await Promise.all(
    (p.parts || []).map(part => importPart(part))
  );

  const { imageDataUrl, parts: _, ...rest } = p;

  return {
    ...rest,
    image: imageBlob,
    imageMeta: p.imageMeta ?? null,
    parts
  };
}

async function importPatternFromFile(data) {

  // MIGRERA TILL SENASTE VERSION (behövs inte för nuvarande filformat)
  // data = migratePattern(data);

  if (!data.pattern) {
    throw new Error("Filen innehåller inget mönster.");
  }

  const pattern = await importPattern(data.pattern);

  if (!pattern) {
    throw new Error("Mönstret kunde inte importeras.");
  }

  // Ge mönstret ett nytt id så att det inte krockar med 
  // befintliga mönster vid import av enskilt mönster
  pattern.id = crypto.randomUUID();

  await idbRunTransaction(
    ["patterns"],
    "readwrite",
    ({ patterns }) => {

      patterns.put(pattern);
    }
  );

  return pattern;
}


async function importFullBackup(data) {

  // MIGRERA TILL SENASTE VERSION
  data = migrateBackup(data);

  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const progress = Array.isArray(data.progress) ? data.progress : [];


  const convertedPatterns = (
    await Promise.all(patterns.map(p => importPattern(p)))
  ).filter(Boolean);

  const patternIds = new Set(convertedPatterns.map(p => p.id));

  const progressToImport = progress.filter(
    pr => pr?.patternId && patternIds.has(pr.patternId)
  );

  await idbRunTransaction(
    ["patterns", "progress"],
    "readwrite",
    ({ patterns, progress }) => {

      patterns.clear();
      progress.clear();

      for (const p of convertedPatterns) {
        patterns.put(p);
      }

      for (const pr of progressToImport) {
        progress.put(pr);
      }
    }
  );

  return {
    patternsImported: convertedPatterns.length,
    progressImported: progressToImport.length
  };
}

export async function importAllFromFile(file) {

  const text = await file.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Filen kunde inte läsas.");
  }

  if (!data || !data.schema) {
    throw new Error("Filen är inte en giltig backup.");
  }

  if (data.version > CURRENT_BACKUP_VERSION) {
    throw new Error("Backupen är från en nyare version av appen.");
  }

  if (data.schema === "crochet-app-backup") {
    return importFullBackup(data);
  }

  if (data.schema === "crochet-app-pattern") {
    return importPatternFromFile(data);
  }

  throw new Error("Okänt filformat.");
}
