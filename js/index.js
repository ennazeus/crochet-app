import { registerPWA } from "./pwa.js";
registerPWA();
import { exportAll, importAllFromFile, exportSinglePattern } from "./backup.js";
import { idbGetAll, idbDelete } from "./db.js";
import { escapeHtml, qs } from "./utils.js";

const exportBackupBtn = document.getElementById("exportBackupBtn");
const importFileInput = document.getElementById("importFile");

const list = qs("#patternsList");
const empty = qs("#emptyState");

exportBackupBtn?.addEventListener("click", async () => {
  try {
    exportBackupBtn.disabled = true;
    await exportAll();
  } catch (err) {
    alert(err.message);
  } finally {
    exportBackupBtn.disabled = false;
  }
});

importFileInput?.addEventListener("change", async (e) => {

  const file = e.target.files[0];
  if (!file) return;

  try {

    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || !data.schema) {
      throw new Error("Filen är inte en giltig backup.");
    }

    if (data.schema === "crochet-app-pattern") {

      const name = data.patternName ?? "Pattern";

      const ok = confirm(`Import pattern "${name}"?`);

      if (!ok) return;

    } else if (data.schema === "crochet-app-backup") {

      const count = Array.isArray(data.patterns) ? data.patterns.length : 0;

      const ok = confirm(
        `Restore backup with ${count} patterns?\n\nThis will replace all existing patterns.`
      );

      if (!ok) return;

    } else {
      throw new Error("Okänt filformat.");
    }

    await importAllFromFile(file);

    alert("Import klar!");

    location.reload();

  } catch (err) {
    alert(err.message);
  }

  e.target.value = "";
});

async function renderList() {
  list.innerHTML = "";

  let patterns = await idbGetAll("patterns");

  // sortera senaste först
  patterns.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!patterns.length) {
    empty?.classList.remove("d-none");
    return;
  }

  empty?.classList.add("d-none");

  for (const p of patterns) {
    const li = document.createElement("li");
    li.className = "list-group-item";

    const row = document.createElement("div");
    row.className = "pattern-row";

    // Thumbnail (om bild finns)
    if (p.image) {
      const thumb = document.createElement("img");
      thumb.className = "pattern-thumb";
      const url = URL.createObjectURL(p.image);
      thumb.src = url;

      thumb.addEventListener("load", () => {
        URL.revokeObjectURL(url);
      }, { once: true });

      row.appendChild(thumb);
    }

    // Titel
    const title = document.createElement("div");
    title.className = "pattern-title";
    title.innerHTML = `<i class="bi bi-journal-text me-2"></i>${escapeHtml(p.name || "Namnlöst mönster")}`;

    title.addEventListener("click", () => {
      window.location.href = `pattern.html?id=${encodeURIComponent(p.id)}`;
    });

    // Redigera
    const editBtn = document.createElement("a");
    editBtn.className = "btn btn-outline-secondary btn-sm";
    editBtn.innerHTML = `<i class="bi bi-pencil"></i>`;
    editBtn.title = "Redigera";
    editBtn.href = `create.html?edit=${encodeURIComponent(p.id)}`;

    // Export
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn btn-outline-secondary btn-sm";
    exportBtn.innerHTML = `<i class="bi bi-download"></i>`;
    exportBtn.title = "Exportera mönster";

    exportBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      try {
        const data = await exportSinglePattern(p.id);

        await shareJson(data.obj, data.filename);

      } catch (err) {
        alert(err.message);
      }
    });

    // Ta bort
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-outline-danger btn-sm";
    delBtn.innerHTML = `<i class="bi bi-trash"></i>`;
    delBtn.title = "Ta bort";

    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const ok = confirm(`Ta bort "${p.name || "Namnlöst mönster"}"?`);
      if (!ok) return;

      await idbDelete("patterns", p.id);
      await idbDelete("progress", p.id); // rensa progress också

      await renderList();
    });

    row.appendChild(title);
    row.appendChild(editBtn);
    row.appendChild(exportBtn);
    row.appendChild(delBtn);

    li.appendChild(row);
    list.appendChild(li);
  }
}

renderList();

