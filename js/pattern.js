import { registerPWA } from "./pwa.js";
registerPWA();
import { idbGet, idbPut, idbDelete } from "./db.js";
import { escapeHtml, escapeAttr, cssSafe, qs } from "./utils.js";

const content = qs("#content");
const notFound = qs("#notFound");
const resetBtn = qs("#resetBtn");

let currentPattern = null;
let currentProgress = null;

function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

function progressDefault(patternId) {
  return { patternId, checked: {}, updatedAt: Date.now() };
}

async function loadProgress(patternId) {
  const p = await idbGet("progress", patternId);
  return p || progressDefault(patternId);
}

async function saveProgress(progress) {
  progress.updatedAt = Date.now();
  await idbPut("progress", progress);
}

function renderTextBlock(text, kind = "intro") {
 const t = String(text ?? "").trim();
  if (!t) return "";

  const label = kind === "outro" ? "Avslutning" : "Inledning";
  const cls = kind === "outro" ? "part-outro" : "part-intro";

  return `
    <div class="${cls} mb-1  preserve-lines">
      <div class="small opacity-75">${label}</div>
      <div>${escapeHtml(t)}</div>
    </div>
  `;
}

function openRelevantPart(pattern) {
  if (!currentProgress) return;

  const parts = pattern.parts || [];
  let partToOpenKey = null;

  for (const part of parts) {
    const partKey = part.part_id || part.name;
    const rows = (part.rows || []);
    const progressRows = currentProgress.checked[partKey] || {};

    const allChecked = rows.length > 0 && rows.every(r => {
      const rn = String(r.row_number ?? "");
      return !!progressRows[rn];
    });

    if (!allChecked) {
      partToOpenKey = partKey;
      break;
    }
  }

  // Om alla delar är klara → öppna sista delen
  if (!partToOpenKey && parts.length > 0) {
    const last = parts[parts.length - 1];
    partToOpenKey = last.part_id || last.name;
  }

  if (!partToOpenKey) return;

  const collapseId = `part-body-${cssSafe(pattern.id)}-${cssSafe(partToOpenKey)}`;
  const body = document.getElementById(collapseId);
  if (body) body.classList.remove("d-none");
}

/**
 * Beskrivning: Rubriker i versaler -> sektioner.
 * Items läggs i två kolumner där vänster fylls först.
 */
function renderDescriptionColumns(root, description) {
  const lines = description
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const sections = [];
  let current = { title: "Allmänt", items: [] };

  const isTitle = (line) => {
    if (line.length < 2) return false;
    const hasLetter = /[A-Za-zÅÄÖåäö]/.test(line);
    return hasLetter && line === line.toUpperCase();
  };

  for (const line of lines) {
    if (isTitle(line)) {
      if (current.items.length) sections.push(current);
      current = { title: line, items: [] };
    } else {
      current.items.push(line);
    }
  }
  if (current.items.length || sections.length === 0) sections.push(current);

  for (const sec of sections) {
    const secWrap = document.createElement("div");
    secWrap.className = "desc-section mb-3 p-3";

    const titleEl = document.createElement("div");
    titleEl.className = "section-title";
    titleEl.textContent = sec.title;
    secWrap.appendChild(titleEl);

    const row = document.createElement("div");
    row.className = "row desc-items text-body-secondary";

    const leftCol = document.createElement("div");
    leftCol.className = "col-12 col-md-6";
    const rightCol = document.createElement("div");
    rightCol.className = "col-12 col-md-6";

    const n = sec.items.length;
    const leftCount = Math.ceil(n / 2);
    const leftItems = sec.items.slice(0, leftCount);
    const rightItems = sec.items.slice(leftCount);

    const makeList = (items) => {
      const ul = document.createElement("ul");
      ul.style.listStyle = "none";
      ul.style.paddingLeft = "0";
      ul.style.margin = "0";

      for (const item of items) {
        const li = document.createElement("li");
        li.style.marginBottom = "0.25rem";

        // valfri fetmarkering av "2 nystan" etc.
        const m = item.match(/^(\d+(?:[.,]\d+)?\s*(?:nystan|st|styck|par|mm)?\b)(.*)$/i);
        if (m) {
          const strong = document.createElement("strong");
          li.appendChild(strong);

          const rest = (m[2] || "").trim();
          if (rest) li.appendChild(document.createTextNode(" " + rest));
        } else {
          li.textContent = item;
        }

        ul.appendChild(li);
      }
      return ul;
    };

    leftCol.appendChild(makeList(leftItems));
    rightCol.appendChild(makeList(rightItems));

    row.appendChild(leftCol);
    row.appendChild(rightCol);
    secWrap.appendChild(row);
    root.appendChild(secWrap);
  }
}

function ensureProgressBucket(partKey) {
  if (!currentProgress.checked[partKey]) currentProgress.checked[partKey] = {};
}


function getPartProgress(part, partKey) {
  const rows = part.rows || [];
  const total = rows.length;
  if (total === 0) return { total: 0, done: 0, percent: 0 };

  const bucket = currentProgress.checked[partKey] || {};
  let done = 0;

  for (const r of rows) {
    const rn = String(r.row_number ?? "");
    if (bucket[rn]) done++;
  }

  const percent = Math.round((done / total) * 100);
  return { total, done, percent };
}

function renderPattern(p) {
  currentPattern = p;

  document.title = p.name ? `${p.name} - Mönster` : "Mönster";

  // Bild (Blob -> ObjectURL)
  let imgUrl = null;
  if (p.image) imgUrl = URL.createObjectURL(p.image);

  content.innerHTML = `
    <div class="mb-4 text-center">

      <h1 class="h3 mb-3">
        ${escapeHtml(p.name || "Namnlöst mönster")}
      </h1>

      ${imgUrl ? `
        <img src="${escapeAttr(imgUrl)}"
            class="img-fluid pattern-image rounded"
            alt="Bild för mönster"
            style="max-width:100%; height:auto;">
      ` : ""}

    </div>
  `;

  // Släpp objectURL efter load
  if (imgUrl) {
    const img = content.querySelector("img");
    img?.addEventListener("load", () => URL.revokeObjectURL(imgUrl), { once: true });
  }

  // Beskrivning
  if (p.description) {
    renderDescriptionColumns(content, p.description);
  }

  // Delar
  for (const part of (p.parts || [])) {

    // Bild för denna del
    let partImgUrl = null;
    if (part.image) {
      partImgUrl = URL.createObjectURL(part.image);
    }
    const partName = part.name || "Del";

    // part_id som nyckel för progress (fallback till namn för äldre data)
    const partKey = part.part_id || partName;
    ensureProgressBucket(partKey);

    const prog = getPartProgress(part, partKey);

    const card = document.createElement("div");
    card.className = "card part-card";

    const rowsHtml = (part.rows || [])
      .slice()
      .sort((a, b) => (a.row_number ?? 0) - (b.row_number ?? 0))
      .map(row => {
        const rn = row.row_number ?? "";
        const instr = row.instruction || "";
        const rnKey = String(rn);

        const checked = !!currentProgress.checked[partKey][rnKey];
        const idAttr = `cb-${cssSafe(p.id)}-${cssSafe(partKey)}-${cssSafe(rnKey)}`;

        return `
          <div class="row-item py-2 border-top"
            title="Vänsterklick: markera klar • Högerklick: ångra senaste">
            <input class="form-check-input row-check" type="checkbox"
                     id="${idAttr}"
                     data-part="${escapeAttr(partKey)}"
                     data-row="${escapeAttr(rnKey)}"
                     ${checked ? "checked" : ""}>

            <span class="row-icon">
              <i class="bi ${checked ? "bi-check-circle-fill" : "bi-circle"}"></i>
            </span>
            <label class="row-text ${checked ? "strike" : ""}" for="${idAttr}">
              <div>
                <span class="fw-semibold">Varv ${escapeHtml(rnKey)}:</span>
                <span>${escapeHtml(instr)}</span>
              </div>
            </label>
          </div>
        `;
      })
      .join("");

    const partIdForDom = cssSafe(partKey); // partKey = part.part_id || partName
    const collapseId = `part-body-${cssSafe(p.id)}-${partIdForDom}`;

    const introHtml = renderTextBlock(part.introText, "intro");
    const outroHtml = renderTextBlock(part.outroText, "outro");

    card.innerHTML = `
      <div class="card-header d-flex align-items-center gap-3">

      <!-- TITEL -->
      <div class="flex-grow-1 part-header"
          role="button"
          data-toggle-part="${escapeAttr(collapseId)}">

        <div class="fw-semibold">
          <i class="bi bi-diagram-3 me-2"></i>${escapeHtml(partName)}
          <i class="bi bi-chevron-down ms-2 text-body-secondary"></i>
        </div>
      </div>

      <!-- PROGRESS (kompakt, högerjusterad) -->
      <div class="part-progress d-flex align-items-center gap-2">

        <span class="progress-text">
          ${prog.done}/${prog.total}
        </span>

        <div class="progress part-progressbar">
          <div class="progress-bar ${prog.percent === 100 ? "bg-success" : ""}"
              role="progressbar"
              style="width:${prog.percent}%"
              data-progressbar="${escapeAttr(partKey)}">
          </div>
        </div>

      </div>

      <!-- ACTIONS -->
      <div class="part-actions d-flex gap-2">
        <button type="button"
                class="btn btn-outline-success btn-sm part-checkall"
                data-partkey="${escapeAttr(partKey)}"
                title="Markera alla varv i delen">
          <i class="bi bi-check2-square"></i>
        </button>

        <button type="button"
                class="btn btn-outline-secondary btn-sm part-uncheckall"
                data-partkey="${escapeAttr(partKey)}"
                title="Avmarkera alla varv i delen">
          <i class="bi bi-square"></i>
        </button>
      </div>

    </div>

      <div id="${collapseId}" class="card-body px-3 d-none">

  <div class="row g-3">

    <!-- TEXT-KOLUMN -->
    <div class="${partImgUrl ? "col-12 col-lg-8" : "col-12"}">
      ${introHtml}
      ${rowsHtml || `<div class="p-3 text-body-secondary">Inga varv i denna del.</div>`}
      ${outroHtml}
    </div>

    <!-- BILD-KOLUMN -->
    ${partImgUrl ? `
      <div class="col-12 col-lg-4 d-flex justify-content-lg-end align-items-start">
        <img src="${escapeAttr(partImgUrl)}"
            class="img-fluid rounded part-image"
            alt="Bild för ${escapeAttr(partName)}">
      </div>
    ` : ""}

  </div>

</div>
    `;

    content.appendChild(card);

    card.querySelectorAll(".row-check").forEach(cb => {
      if (cb.checked) {
        const rowEl = cb.closest(".row-item");
        setRowDone(rowEl, true);
        updateNextRowHighlight(card);
      }
    });

    // Släpp objectURL för part-bild
    if (partImgUrl) {
      const img = card.querySelector("img.part-image");
      img?.addEventListener("load", () => {
        URL.revokeObjectURL(partImgUrl);
      }, { once: true });
    }

  }
}

function updatePartProgressUI(partKey) {
  if (!currentPattern) return;

  const part = (currentPattern.parts || [])
    .find(p => (p.part_id || p.name) === partKey);
  if (!part) return;

  const prog = getPartProgress(part, partKey);

  const bar = document.querySelector(
    `[data-progressbar="${CSS.escape(partKey)}"]`
  );
  if (!bar) return;

  // uppdatera bredd
  bar.style.width = prog.percent + "%";

  // färg när klar
  bar.classList.toggle("bg-success", prog.percent === 100);

  // uppdatera text
  const text = bar
  ?.closest(".part-progress")
  ?.querySelector(".progress-text");

  if (text) text.textContent = `${prog.done} / ${prog.total}`;
}

function getOrderedRowCheckboxes(card) {
  return [...card.querySelectorAll("input.row-check")]
    .sort((a, b) => Number(a.dataset.row) - Number(b.dataset.row));
}

function getFirstUnchecked(cbs) {
  return cbs.find(cb => !cb.checked);
}

function getLastChecked(cbs) {
  return [...cbs].reverse().find(cb => cb.checked);
}

function setRowDone(rowEl, isDone) {
  const icon = rowEl.querySelector(".row-icon i");
  const label = rowEl.querySelector(".row-text");

  rowEl.classList.toggle("done", isDone);
  label?.classList.toggle("strike", isDone);

  if (icon) {
    icon.className = isDone
      ? "bi bi-check-circle-fill"
      : "bi bi-circle";
  }
}

function updateNextRowHighlight(card) {
  const rows = [...card.querySelectorAll(".row-item")];
  rows.forEach(r => r.classList.remove("next"));

  const firstUndone = rows.find(r => !r.classList.contains("done"));
  if (firstUndone) {
    firstUndone.classList.add("next");
    firstUndone.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }
}

content.addEventListener("click", async (e) => {
  // Toggle part-body
  const toggle = e.target.closest("[data-toggle-part]");
  if (toggle) {
    const id = toggle.getAttribute("data-toggle-part");
    const body = document.getElementById(id);
    if (body) body.classList.toggle("d-none");
    return;
  }

  // Markera alla i en del
  const checkAllBtn = e.target.closest(".part-checkall");
  if (checkAllBtn) {
    if (!currentPattern || !currentProgress) return;
    const partKey = checkAllBtn.dataset.partkey;
    if (!partKey) return;

    ensureProgressBucket(partKey);

    // hitta alla checkboxar i den delens card
    const card = checkAllBtn.closest(".card");
    const cbs = card?.querySelectorAll('input.row-check');
    if (!cbs?.length) return;

    cbs.forEach(cb => {
      cb.checked = true;
      const rowNo = cb.dataset.row;
      currentProgress.checked[partKey][rowNo] = true;

      const rowEl = cb.closest(".row-item");
      setRowDone(rowEl, true);
      updateNextRowHighlight(card);
    });

    await saveProgress(currentProgress);
    updatePartProgressUI(partKey);
    return;
  }

  // Avmarkera alla i en del
  const uncheckAllBtn = e.target.closest(".part-uncheckall");
  if (uncheckAllBtn) {
    if (!currentPattern || !currentProgress) return;
    const partKey = uncheckAllBtn.dataset.partkey;
    if (!partKey) return;

    ensureProgressBucket(partKey);

    const card = uncheckAllBtn.closest(".card");
    const cbs = card?.querySelectorAll('input.row-check');
    if (!cbs?.length) return;

    cbs.forEach(cb => {
      cb.checked = false;
      const rowNo = cb.dataset.row;
      currentProgress.checked[partKey][rowNo] = false;

      const rowEl = cb.closest(".row-item");
      setRowDone(rowEl, false);
      updateNextRowHighlight(card);
    });

    await saveProgress(currentProgress);
    updatePartProgressUI(partKey);
    return;
  }
});

content.addEventListener("click", async (e) => {
  const row = e.target.closest(".row-item");
  if (!row || !currentPattern || !currentProgress) return;

  const cb = row.querySelector("input.row-check");
  if (!cb) return;

  e.preventDefault(); // stoppa native checkbox-toggle

  const card = row.closest(".card");
  const cbs = getOrderedRowCheckboxes(card);
  if (!cbs.length) return;

  const partKey = cb.dataset.part;
  ensureProgressBucket(partKey);

  const firstUnchecked = getFirstUnchecked(cbs);
  if (!firstUnchecked) return;

  // Om användaren klickade exakt rätt rad → använd den
  const target = (cb === firstUnchecked) ? cb : firstUnchecked;

  target.checked = true;
  currentProgress.checked[partKey][target.dataset.row] = true;

  const rowEl = target.closest(".row-item");
  setRowDone(rowEl, true);
  updateNextRowHighlight(card);

  await saveProgress(currentProgress);
  updatePartProgressUI(partKey);
});

content.addEventListener("contextmenu", async (e) => {
  const row = e.target.closest(".row-item");
  if (!row || !currentPattern || !currentProgress) return;

  e.preventDefault(); // stoppa webbläsarens meny

  const card = row.closest(".card");
  const cbs = getOrderedRowCheckboxes(card);
  if (!cbs.length) return;

  const partKey = cbs[0].dataset.part;
  ensureProgressBucket(partKey);

  const lastChecked = getLastChecked(cbs);
  if (!lastChecked) return;

  // avmarkera senaste klara
  lastChecked.checked = false;
  currentProgress.checked[partKey][lastChecked.dataset.row] = false;

  const rowEl = lastChecked.closest(".row-item");
  setRowDone(rowEl, false);

  await saveProgress(currentProgress);
  updatePartProgressUI(partKey);
  updateNextRowHighlight(card);
});

resetBtn?.addEventListener("click", async () => {
  if (!currentPattern) return;
  const ok = confirm("Rensa all progress för detta mönster?");
  if (!ok) return;

  await idbDelete("progress", currentPattern.id);
  currentProgress = progressDefault(currentPattern.id);

  // rendera om
  renderPattern(currentPattern);
});

async function main() {
  const editBtn = document.getElementById("editBtn");
  const id = getIdFromUrl();
  if (editBtn && id) {
    editBtn.href = `create.html?edit=${encodeURIComponent(id)}`;
  }
  
  if (!id) {
    notFound.classList.remove("d-none");
    resetBtn.disabled = true;
    return;
  }

  const pattern = await idbGet("patterns", id);
  console.log("pattern från IndexedDB:", pattern);
  if (!pattern) {
    notFound.classList.remove("d-none");
    resetBtn.disabled = true;
    return;
  }

  currentProgress = await loadProgress(pattern.id);
  renderPattern(pattern);
  
  // öppna första delen som inte är klar automatiskt
  openRelevantPart(pattern);
}

main();