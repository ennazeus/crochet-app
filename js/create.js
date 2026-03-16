import { registerPWA } from "./pwa.js";
registerPWA();
import { idbGet, idbPut } from "./db.js";
import { imageFileToResizedBlob } from "./image.js";

import { escapeAttr } from "./utils.js";

// --- Elementreferenser ---
const form = document.querySelector("form");
const partsContainer = document.getElementById("partsContainer");
const addPartBtn = document.getElementById("addPartBtn");

// Förhindra att Enter i formuläret skickar det (förutom i textarea)
form?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});

// --- Kolla om vi är i edit-läge (med ?edit=ID) ---
const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");

// --- Bootstrap validering ---
(() => {
  "use strict";
  const forms = document.querySelectorAll(".needs-validation");
  Array.from(forms).forEach(f => {
    f.addEventListener("submit", evt => {
      if (!f.checkValidity()) {
        evt.preventDefault();
        evt.stopPropagation();
      }
      f.classList.add("was-validated");
    }, false);
  });
})();

// --- Bild-state ---
let currentImageBlob = null;
let currentImageMeta = null;
let removeImageFlag = false;

// --- Hantering av bildval och förhandsvisning ---
const imgInput = document.getElementById("pattern_image");
const preview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

// Visar förhandsvisning av bilden från en Blob, eller döljer den om null.
function showPreviewFromBlob(blob) {
  if (!preview) return;

  // Om ingen blob => göm förhandsvisning och "ta bort bild"-knappen
  if (!blob) {
    preview.classList.add("d-none");
    preview.src = "";
    removeImageBtn?.classList.add("d-none");
    return;
  }

  // Skapa en temporär URL för bloben och visa den i img-elementet
  const url = URL.createObjectURL(blob);
  preview.src = url;
  preview.classList.remove("d-none");
  removeImageBtn?.classList.remove("d-none");
  preview.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
}

// När en bild väljs i filväljaren, processa den och visa förhandsvisningen. 
// Spara också blob och metadata i state.
imgInput?.addEventListener("change", async () => {

  // Om ingen fil valts (t.ex. om användaren avbryter filväljaren) => gör inget
  const file = imgInput.files?.[0];
  if (!file) return;

  // När en ny fil väljs, återställ "ta bort bild"-flaggan 
  // (om den var satt) och uppdatera förhandsvisningen
  removeImageFlag = false;
  const { blob, meta } = await imageFileToResizedBlob(file, {
    maxWidth: 480,
    maxHeight: 480,
    mimeType: "image/jpeg",
    quality: 0.82
  });

  currentImageBlob = blob;
  currentImageMeta = meta;
  showPreviewFromBlob(blob);
});

// När "ta bort bild"-knappen klickas, sätt flagga och uppdatera förhandsvisningen
removeImageBtn?.addEventListener("click", () => {
  removeImageFlag = true;
  currentImageBlob = null;
  currentImageMeta = null;
  if (imgInput) imgInput.value = "";
  showPreviewFromBlob(null);
});

// --- Dynamisk hantering av delar och varv ---
let partIndex = 0;

const partImageState = new Map();

/// Skapar ett nytt varv-input med rätt namn och index, 
// och returnerar det som ett DOM-element.
function createRow(partIdx, rowIdx, instructionValue = "", rowNumberValue = "") {
  const row = document.createElement("div");
  row.className = "input-group";
  row.dataset.rowIndex = rowIdx;

  // Namnformat: 
  // parts[PART_IDX][rows][ROW_IDX][instruction] och 
  // parts[PART_IDX][rows][ROW_IDX][row_number]
  row.innerHTML = `
    <span class="input-group-text">Varv</span>
    <input type="number" min="1" class="form-control" name="parts[${partIdx}][rows][${rowIdx}][row_number]"
           placeholder="1" value="${escapeAttr(rowNumberValue || "")}" aria-label="Varvnummer">
    <input type="text" class="form-control" name="parts[${partIdx}][rows][${rowIdx}][instruction]"
           placeholder="t.ex. 6 fm i magisk ring" value="${escapeAttr(instructionValue || "")}" aria-label="Instruktion">
    <button type="button" class="btn btn-outline-secondary removeRowBtn" title="Ta bort varv">
      <i class="bi bi-x-lg"></i>
    </button>
  `;
  return row;
}

// Skapar ett nytt del-kort med rätt namn och index, och returnerar det som ett DOM-element.
function createPartCard(partIdx, partNameValue = "", partId = crypto.randomUUID()) {
  const collapseId = `part-body-${partIdx}`;
  const card = document.createElement("div");
  card.className = "card part-card";
  card.dataset.partIndex = partIdx;
  card.dataset.partId = partId;

card.innerHTML = `
  <div class="card-header d-flex align-items-center">

    <!-- Titel / toggle -->
    <div class="d-flex align-items-center gap-2 flex-grow-1 part-toggle"
        role="button"
        data-toggle-part="${collapseId}"
        title="Fäll ihop/ut">

      <i class="bi bi-diagram-3"></i>

      <span class="fw-semibold">
        ${escapeAttr(partNameValue || "Ny del")}
      </span>

      <i class="bi bi-chevron-down text-body-secondary"></i>
    </div>

    <!-- KNAPP-GRUPP -->
    <div class="d-flex gap-2 flex-shrink-0">

      <button type="button" class="btn btn-outline-primary btn-sm addRowBtn">
        <i class="bi bi-plus-circle"></i>
      </button>

      <button type="button"
              class="btn btn-outline-secondary btn-sm"
              data-bs-toggle="collapse"
              data-bs-target="#paste-${partIdx}">
        <i class="bi bi-clipboard-plus"></i>
      </button>

      <button type="button"
              class="btn btn-outline-danger btn-sm removePartBtn">
        <i class="bi bi-trash"></i>
      </button>

      <input type="hidden"
            name="parts[${partIdx}][part_id]"
            value="${escapeAttr(partId)}">
    </div>

  </div>

  <div id="${collapseId}" class="card-body d-none ">

    <div class="mb-3">
      <label class="form-label">Delens namn</label>
      <input type="text"
             class="form-control"
             name="parts[${partIdx}][name]"
             value="${escapeAttr(partNameValue || "")}"
             required>
    </div>
    
    <div class="mb-3">
      <label class="form-label">Anteckningar (valfri)</label>
      <textarea class="form-control"
                name="parts[${partIdx}][notes]"
                rows="2"></textarea>
    </div>

    <div class="collapse mb-3" id="paste-${partIdx}">
      <div class="mb-2">
        <label class="form-label">Klistra in rader för denna del</label>
        <textarea class="form-control pasteText" data-part-index="${partIdx}" rows="6"
            placeholder="Tips: Ett varv måste starta på ny rad och börja med 'Varv', 'V', 'Row', 'Rnd' eller 'Round', t.ex.:

Varv 1: ...
Varv 2: ...
Varv 3-6: ..."></textarea>
      </div>

      <div class="row g-2 align-items-center">
        <div class="col-12 col-md-auto ms-md-auto">
          <button type="button" class="btn btn-outline-secondary btn-sm pasteRowsExample" data-part-index="${partIdx}">
            <i class="bi bi-file-earmark-text me-1"></i>Exempel
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm pasteRowsClear" data-part-index="${partIdx}">
            <i class="bi bi-x-circle me-1"></i>Rensa
          </button>
          <button type="button" class="btn btn-primary btn-sm pasteRowsReplace" data-part-index="${partIdx}">
            <i class="bi bi-arrow-repeat me-1"></i>Ersätt
          </button>
        </div>
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label">Inledande beskrivning (valfri)</label>
      <textarea class="form-control" name="parts[${partIdx}][introText]" rows="2"
        placeholder="Börja med färg (08)"></textarea>
    </div>
    <div class="vstack gap-2 rowsContainer"></div>
    <div class="mt-3">
      <label class="form-label">Avslutande beskrivning (valfri)</label>
      <textarea class="form-control" name="parts[${partIdx}][outroText]" rows="2"
        placeholder="Avsluta arbetet och lämna en lagom lång garnände för montering...."></textarea>
    </div>
    <div class="mb-3">
     <div class="mt-3">
        <label class="form-label">Bild (valfri)</label>
        <input type="file"
              class="form-control partImageInput"
              accept="image/*">
        <div class="form-text">Skalas ner och sparas lokalt.</div>

        <img class="img-fluid rounded mt-2 d-none partImagePreview">
        <button type="button"
                class="btn btn-outline-danger btn-sm mt-2 d-none removePartImageBtn">
          <i class="bi bi-trash me-1"></i>Ta bort bild
        </button>
      </div>
    </div>
  </div>
`;

  // starta med ett första varv
  const rowsContainer = card.querySelector(".rowsContainer");
  rowsContainer.appendChild(createRow(partIdx, 1, "", 1));

  return card;
}

// Om delens body är stängd, öppna den och returnera true. 
// Om den redan var öppen, gör ingenting och returnera false.
function ensurePartOpen(card) {
  const body = card.querySelector(".card-body");
  if (!body) return false;

  const wasClosed = body.classList.contains("d-none");

  if (wasClosed) {
    body.classList.remove("d-none");
  }

  return wasClosed;
}

// Lägg till en ny del med det angivna namnet. 
// Om open=true, stäng alla andra delar och öppna den nya. 
function addPart(defaultName = "", partId = null, open = true, focusTarget = "part") {

  if (!defaultName) {
    defaultName = getNextPartName();
  }

  partIndex++;

  const card = createPartCard(partIndex, defaultName, partId || crypto.randomUUID());

  if (open) {
    // Stäng alla öppna delar
    partsContainer.querySelectorAll(".card-body").forEach(body => {
      body.classList.add("d-none");
    });
  }

  partsContainer.appendChild(card);

  if (open) {
    const body = card.querySelector(".card-body");
    if (body) body.classList.remove("d-none");

    setTimeout(() => {

      if (focusTarget === "part") {
        const y = card.getBoundingClientRect().top + window.pageYOffset - 20;

        window.scrollTo({
          top: y,
          behavior: "smooth"
        });
      }

      if (focusTarget === "part") {
        const nameInput = card.querySelector('input[name$="[name]"]');
        nameInput?.focus();
        nameInput?.select();
      }

      if (focusTarget === "pattern") {
        const patternName = document.getElementById("pattern_name");
        patternName?.focus();
      }

    }, 50);
  }
}

addPartBtn?.addEventListener("click", () => addPart(""));

// Init – lägg till första del
addPart("Del 1", null, true, "pattern");




// --- Hjälpfunktioner för index och nästa varvnummer ---
function getMaxRowIdx(rowsContainer) {
  let max = 0;
  rowsContainer.querySelectorAll(".input-group").forEach(g => {
    const idx = parseInt(g.dataset.rowIndex, 10);
    if (!isNaN(idx) && idx > max) max = idx;
  });
  return max;
}
function getMaxRowNumber(rowsContainer) {
  let max = 0;
  rowsContainer.querySelectorAll('input[name$="[row_number]"]').forEach(inp => {
    const v = parseInt(inp.value, 10);
    if (!isNaN(v) && v > max) max = v;
  });
  return max;
}
function getNextPartName() {
  return `Del ${partIndex + 1}`;
}

// --- Parser per del (din) ---
// Normalisera inklistrad text till en rad per "Varv …" / "Row …"
// och försök bryta PDF-klumpar där ett nytt varv börjar mitt i raden.
function normalizeRowsText(text) {
  if (!text) return "";

  let t = text
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ");

  // PDF-fixar
  t = t.replace(/\n(\[[^\]]+\]|\(\s*[^)]*?\s*\))/g, " $1");
  t = t.replace(/\b(row|rnd|round|varv)\s*\n\s*(\d+)/gi, "$1 $2");

  return t
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .join("\n");
}

// Känner igen: "Varv 1: …", "V1-3 …", "Row 2–5: …", "Rnd 4. …"
const rowRe =
/^(?:varv|v|r|row|rows|round|rounds|rnd|rnds)\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:[\(\{]([^)\}]*)[\)\}])?\s*[:.)-]?\s*(.*)$/i;

// Känner igen: "4-6 (3 varv): text", "4 - 6: text", "4–6. text"
const rangeRowRe = /^(\d+)\s*[-–]\s*(\d+)\s*(?:\(([^)]*)\))?\s*[:.)-]?\s*(.*)$/;

// Känner igen: "1: text", "1. text", "1) text", "1 - text"
const numberRowRe = /^(\d+)\s*[:.)-]\s*(.*)$/;

// Returnerar [{row_number, instruction}, ...]
function parseRowsText(text) {
  const t = normalizeRowsText(text);
  const lines = t.split("\n");

  const out = [];
  let next = 1;

  let lastRow = null;

  // 1) allt före första varvet
  const introLines = [];

  // 2) “lösa rader” efter senaste varv – vi vet inte än om de är
  //    fortsättning på varvet eller outroText (avgörs om ett nytt varv kommer)
  let tailBuffer = [];

  let seenAnyRow = false;

  function flushTailBufferToLastRow() {
    if (!tailBuffer.length || !lastRow) return;
    const extra = tailBuffer.join(" ").trim();
    if (extra) {
      lastRow.instruction = lastRow.instruction
        ? `${lastRow.instruction} ${extra}`
        : extra;
    }
    tailBuffer = [];
  }

  for (const line of lines) {
    // matcha "Varv/Row/Rnd ..."
    let m = line.match(rowRe);
    if (m) {
      // vi hittade ett nytt varv -> då var ev tailBuffer fortsättning på föregående varv
      if (seenAnyRow) flushTailBufferToLastRow();
      seenAnyRow = true;

      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : null;
      const note = (m[3] || "").trim();      
      const instr = (m[4] || "").trim();     

      if (end !== null && end >= start) {
      for (let n = start; n <= end; n++) {
          const row = { 
            row_number: n, 
            instruction: instr,
            note: note || null
          };
          out.push(row);
          lastRow = row;
        }
        next = end + 1;
      } else {
        const row = { 
          row_number: start, 
          instruction: instr,
          note: note || null
        };
        out.push(row);
        lastRow = row;
        next = Math.max(next, start + 1);
      }
      continue;
    }

    // matcha "4-6 (3 rounds): text"
    m = line.match(rangeRowRe);
    if (m) {
      if (seenAnyRow) flushTailBufferToLastRow();
      seenAnyRow = true;

      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      const note = (m[3] || "").trim();
      const instr = (m[4] || "").trim();

      for (let n = start; n <= end; n++) {
        const row = {
          row_number: n,
          instruction: instr,
          note: note || null
        };
        out.push(row);
        lastRow = row;
      }

      next = end + 1;
      continue;
    }

    // matcha "1: text"
    m = line.match(numberRowRe);
    if (m) {
      if (seenAnyRow) flushTailBufferToLastRow();
      seenAnyRow = true;

      const n = parseInt(m[1], 10);
      const instr = (m[2] || "").trim();

      const row = { row_number: n, instruction: instr };
      out.push(row);
      lastRow = row;
      next = Math.max(next, n + 1);
      continue;
    }

    // övriga rader
    if (!line) continue;

    if (!seenAnyRow) {
      // före första varv => intro
      introLines.push(line);
      continue;
    }

    // efter att vi sett varv: lägg i buffer (kan bli fortsättning eller outro)
    if (lastRow) {
      tailBuffer.push(line);
    } else {
      // fallback om något skulle vara konstigt
      const row = { row_number: next++, instruction: line };
      out.push(row);
      lastRow = row;
    }
  }

  // Om vi har tailBuffer kvar i slutet => det är avslutande text
  const outroText = tailBuffer.join("\n").trim();

  return {
    introText: introLines.join("\n").trim(),
    rows: out,
    outroText
  };
}

// --- Delegation för knappar i del-korten ---
partsContainer?.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle-part]");
  if (toggle) {
    const id = toggle.getAttribute("data-toggle-part");
    const body = document.getElementById(id);
    if (body) body.classList.toggle("d-none");
    return;
  }
  const addRowBtn = e.target.closest(".addRowBtn");
  const removePartBtn = e.target.closest(".removePartBtn");
  const removeRowBtn = e.target.closest(".removeRowBtn");
  const removePartImageBtn = e.target.closest(".removePartImageBtn");
  const replaceBtn = e.target.closest(".pasteRowsReplace");
  const exampleBtn = e.target.closest(".pasteRowsExample");
  const clearBtn = e.target.closest(".pasteRowsClear");

    if (removePartImageBtn) {
    const card = removePartImageBtn.closest(".card");
    const partId = card.dataset.partId;
    const preview = card.querySelector(".partImagePreview");
    const fileInput = card.querySelector(".partImageInput");

    partImageState.set(partId, { blob: null, meta: null, removeFlag: true });

    preview.src = "";
    preview.classList.add("d-none");
    removePartImageBtn.classList.add("d-none");
    if (fileInput) fileInput.value = "";
    return;
  }

  const pasteToggleBtn = e.target.closest('[data-bs-toggle="collapse"]');
  if (pasteToggleBtn) {
    const card = pasteToggleBtn.closest(".card");
    const wasClosed = ensurePartOpen(card);

    const targetSelector = pasteToggleBtn.getAttribute("data-bs-target");
    const pasteBox = card.querySelector(targetSelector);

    setTimeout(() => {
      if (pasteBox) {
        const y = pasteBox.getBoundingClientRect().top + window.pageYOffset - 20;

        window.scrollTo({
          top: y,
          behavior: "smooth"
        });

        const textarea = pasteBox.querySelector(".pasteText");
        textarea?.focus();

      }
    }, wasClosed ? 80 : 10);
  }

  if (addRowBtn) {
    const card = addRowBtn.closest(".card");
    const wasClosed = ensurePartOpen(card);

    const partIdx = card.dataset.partIndex;
    const rowsContainer = card.querySelector(".rowsContainer");

    // 🔎 1. Kolla om det finns en tom instruktion
    const instructionInputs = rowsContainer.querySelectorAll('input[name$="[instruction]"]');

    let emptyRow = null;

    for (const input of instructionInputs) {
      if (!input.value.trim()) {
        emptyRow = input.closest(".input-group");
        break;
      }
    }

    // Om tom rad finns → använd den
    if (emptyRow) {
      setTimeout(() => {
        const y = emptyRow.getBoundingClientRect().top + window.pageYOffset - 20;

        window.scrollTo({
          top: y,
          behavior: "smooth"
        });

        const input = emptyRow.querySelector('input[name$="[instruction]"]');
        input?.focus();
      }, wasClosed ? 80 : 10);

      return;
    }

    // Annars skapa ny rad
    let nextIdx = getMaxRowIdx(rowsContainer) + 1;
    const nextRowNumber = getMaxRowNumber(rowsContainer) + 1;

    const newRow = createRow(partIdx, nextIdx, "", nextRowNumber);
    rowsContainer.appendChild(newRow);

    setTimeout(() => {
      const y = newRow.getBoundingClientRect().top + window.pageYOffset - 20;

      window.scrollTo({
        top: y,
        behavior: "smooth"
      });

      const instructionInput = newRow.querySelector('input[name$="[instruction]"]');
      instructionInput?.focus();
    }, wasClosed ? 80 : 10);

    return;
  }

  if (removePartBtn) {

    const card = removePartBtn.closest(".card");
    const next = card.nextElementSibling;
    const prev = card.previousElementSibling;

    card.remove();

    let target = next || prev;

    if (!target) {
      // om inga delar finns kvar
      addPart();
      return;
    }

    const body = target.querySelector(".card-body");
    if (body) body.classList.remove("d-none");

    const input = target.querySelector('input[name$="[instruction]"]');
    input?.focus();

    return;
  }

  if (removeRowBtn) {
    removeRowBtn.closest(".input-group")?.remove();
    return;
  }

  if (exampleBtn) {
    const card = exampleBtn.closest(".card");
    const partIdx = card.dataset.partIndex;
    const pasteBox = card.querySelector(`.pasteText[data-part-index="${partIdx}"]`);
    if (pasteBox) {
      pasteBox.value =
`Varv 1: 6 fm i en mr [6]
Varv 2-3: fm i alla 6 m [6]
Varv 4: (färg 03) öka i följande 2 m, (färg 16) öka i följande 3 m [11]
Varv 5: (färg 03) fm i följande 4 m, (färg 16) fm i följande 7 m [11]
Byt till färg (16)
Varv 6-7: fm i alla m [11]`;
    }
    return;
  }

  if (clearBtn) {
    const card = clearBtn.closest(".card");
    const partIdx = card.dataset.partIndex;
    const pasteBox = card.querySelector(`.pasteText[data-part-index="${partIdx}"]`);

    if (pasteBox) {
      pasteBox.value = "";
      pasteBox.focus();
    }

    return;
  }

  if (replaceBtn) {
    const card = replaceBtn.closest(".card");
    const partIdx = card.dataset.partIndex;
    const rowsContainer = card.querySelector(".rowsContainer");
    const pasteBox = card.querySelector(`.pasteText[data-part-index="${partIdx}"]`);
    const text = pasteBox?.value || "";

    const parsed = parseRowsText(text);

    const introField = card.querySelector(`textarea[name="parts[${partIdx}][introText]"]`);
    const outroField = card.querySelector(`textarea[name="parts[${partIdx}][outroText]"]`);

    // Rensa allt
    rowsContainer.innerHTML = "";

    if (introField) introField.value = parsed.introText || "";
    if (outroField) outroField.value = parsed.outroText || "";

    let nextIdx = 1;

    if ((parsed.rows?.length || 0) === 0) {
      rowsContainer.appendChild(createRow(partIdx, nextIdx, "", 1));
    } else {
      for (const r of parsed.rows) {
        rowsContainer.appendChild(
          createRow(partIdx, nextIdx++, r.instruction || "", r.row_number || "")
        );
      }
    }

    // Scrolla till första nya raden
    setTimeout(() => {
      const firstRow = rowsContainer.querySelector(".input-group");
      if (!firstRow) return;

      const y = firstRow.getBoundingClientRect().top + window.pageYOffset - 20;
      window.scrollTo({ top: y, behavior: "smooth" });

      const input = firstRow.querySelector('input[name$="[instruction]"]');
      input?.focus();
    }, 50);

    return;
  }
});

partsContainer?.addEventListener("change", async (e) => {
  const fileInput = e.target.closest(".partImageInput");
  if (!fileInput) return;

  const card = fileInput.closest(".card");
  const partId = card.dataset.partId;
  const preview = card.querySelector(".partImagePreview");
  const removeBtn = card.querySelector(".removePartImageBtn");

  const file = fileInput.files?.[0];
  if (!file) return;

  const { blob, meta } = await imageFileToResizedBlob(file, {
    maxWidth: 480,
    maxHeight: 480,
    mimeType: "image/jpeg",
    quality: 0.82
  });

  partImageState.set(partId, { blob, meta, removeFlag: false });

  const url = URL.createObjectURL(blob);
  preview.src = url;
  preview.classList.remove("d-none");
  removeBtn.classList.remove("d-none");

  preview.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
});

partsContainer?.addEventListener("keydown", (e) => {

  const instructionInput = e.target.closest('input[name$="[instruction]"]');
  if (!instructionInput) return;

  const row = instructionInput.closest(".input-group");
  const card = instructionInput.closest(".card");
  const rowsContainer = row.closest(".rowsContainer");
  const partIdx = card.dataset.partIndex;

  // -------------------------
  // CTRL + ENTER → ny del
  // -------------------------
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();

    const partCount = partsContainer.querySelectorAll(".card").length;
    addPart(`Del ${partCount + 1}`);

    const newCard = partsContainer.lastElementChild;
    const firstInput = newCard?.querySelector('input[name$="[instruction]"]');
    firstInput?.focus();

    return;
  }

  // -------------------------
  // ENTER → ny rad
  // -------------------------
  if (e.key === "Enter") {
    e.preventDefault();

    let nextIdx = getMaxRowIdx(rowsContainer) + 1;
    const nextRowNumber = getMaxRowNumber(rowsContainer) + 1;

    const newRow = createRow(partIdx, nextIdx, "", nextRowNumber);
    row.after(newRow);

    const newInput = newRow.querySelector('input[name$="[instruction]"]');
    newInput?.focus();

    return;
  }

  // -------------------------
  // BACKSPACE → ta bort tom rad
  // -------------------------
  if (e.key === "Backspace") {

    if (instructionInput.value.trim() !== "") return;

    if (rowsContainer.querySelectorAll(".input-group").length === 1) return;

    e.preventDefault();

    const prevRow = row.previousElementSibling;
    row.remove();

    const prevInput = prevRow?.querySelector('input[name$="[instruction]"]');
    prevInput?.focus();
  }

});

partsContainer?.addEventListener("blur", (e) => {
  const instructionInput = e.target.closest('input[name$="[instruction]"]');
  if (!instructionInput) return;

  const text = instructionInput.value.trim();

  // matchar t.ex. 5-8: text
  const m = text.match(/^(\d+)\s*[-–]\s*(\d+)\s*[:.)-]?\s*(.*)$/);

  if (!m) return;

  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  const instruction = m[3].trim();

  if (end < start) return;

  const row = instructionInput.closest(".input-group");
  const rowsContainer = row.closest(".rowsContainer");
  const card = row.closest(".card");
  const partIdx = card.dataset.partIndex;

  // sätt första varvet
  const numberInput = row.querySelector('input[name$="[row_number]"]');
  numberInput.value = start;
  instructionInput.value = instruction;

  let insertAfter = row;

  for (let n = start + 1; n <= end; n++) {
    const nextIdx = getMaxRowIdx(rowsContainer) + 1;
    const newRow = createRow(partIdx, nextIdx, instruction, n);

    insertAfter.after(newRow);
    insertAfter = newRow;
  }

}, true);

partsContainer?.addEventListener("blur", (e) => {
  const instructionInput = e.target.closest('input[name$="[instruction]"]');
  if (!instructionInput) return;

  const text = instructionInput.value.trim();

  // matchar t.ex:
  // 1: text
  // 1. text
  // 1) text
  // 1 - text
  const m = text.match(/^(\d+)\s*[:.)-]\s*(.*)$/);

  if (!m) return;

  const rowNumber = parseInt(m[1], 10);
  const instruction = m[2].trim();

  const row = instructionInput.closest(".input-group");
  const numberInput = row.querySelector('input[name$="[row_number]"]');

  if (numberInput && !numberInput.value) {
    numberInput.value = rowNumber;
  }

  instructionInput.value = instruction;
}, true);

partsContainer?.addEventListener("blur", (e) => {
  const instructionInput = e.target.closest('input[name$="[instruction]"]');
  if (!instructionInput) return;

  const row = instructionInput.closest(".input-group");
  const rowsContainer = row.closest(".rowsContainer");

  const numberInput = row.querySelector('input[name$="[row_number]"]');

  if (!numberInput) return;

  // om användaren redan satt nummer → gör inget
  if (numberInput.value) return;

  const max = getMaxRowNumber(rowsContainer);

  numberInput.value = max ? max + 1 : 1;

}, true);


// --- Fill form from IndexedDB pattern (edit) ---
async function fillFormFromPattern(p) {
  document.getElementById("pattern_name").value = p.name || "";
  document.getElementById("pattern_description").value = p.description || "";

  partsContainer.innerHTML = "";
  partIndex = 0;

  for (const part of (p.parts || [])) {
    addPart(part.name || "", part.part_id, false); // <-- behåll part_id!
    const card = partsContainer.lastElementChild;



    const notes = card.querySelector(`textarea[name="parts[${partIndex}][notes]"]`);
    if (notes) notes.value = part.notes || "";

    const intro = card.querySelector(`textarea[name="parts[${partIndex}][introText]"]`);
    if (intro) intro.value = part.introText || "";

    const outro = card.querySelector(`textarea[name="parts[${partIndex}][outroText]"]`);
    if (outro) outro.value = part.outroText || "";

    const rowsContainer = card.querySelector(".rowsContainer");
    rowsContainer.innerHTML = "";

    let rowIdx = 0;
    for (const r of (part.rows || [])) {
      rowIdx++;
      rowsContainer.appendChild(createRow(partIndex, rowIdx, r.instruction || "", r.row_number ?? ""));
    }
    if (!rowsContainer.children.length) {
      rowsContainer.appendChild(createRow(partIndex, 1, "", 1));
    }
    // DELENS BILD
    if (part.image) {
      const preview = card.querySelector(".partImagePreview");
      const removeBtn = card.querySelector(".removePartImageBtn");

      const url = URL.createObjectURL(part.image);
      preview.src = url;
      preview.classList.remove("d-none");
      removeBtn.classList.remove("d-none");

      preview.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });

      // Återställ state så submit-logiken fungerar
      partImageState.set(part.part_id, {
        blob: part.image,
        meta: part.imageMeta,
        removeFlag: false
      });
    }
  }



  if (!partsContainer.children.length) addPart("");

  // Bild
  currentImageBlob = p.image || null;
  currentImageMeta = p.imageMeta || null;
  removeImageFlag = false;
  showPreviewFromBlob(currentImageBlob);

  document.querySelector("h1").textContent = "Redigera mönster";
  document.querySelector('button[type="submit"]').innerHTML =
    `<i class="bi bi-save me-1"></i>Spara ändringar`;
}

if (editId) {
  const p = await idbGet("patterns", editId);
  if (p) await fillFormFromPattern(p);
}

// --- Submit: spara till IndexedDB ---
form?.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  if (!form.checkValidity()) return;

  const fd = new FormData(form);
  const now = Date.now();

  const patternId = editId || crypto.randomUUID();
  const pattern = {
    id: patternId,
    name: fd.get("name") || "",
    description: fd.get("description") || "",
    parts: [],
    image: null,
    imageMeta: null,
    createdAt: now,
    updatedAt: now
  };

  let existing = null;
  if (editId) {
    existing = await idbGet("patterns", editId);
    if (existing?.createdAt) pattern.createdAt = existing.createdAt;
  }

  // parts + rows + part_id
  const partsMap = new Map();

  for (const [key, value] of fd.entries()) {
    const mPartId   = key.match(/^parts\[(\d+)\]\[part_id\]$/);
    const mPartName = key.match(/^parts\[(\d+)\]\[name\]$/);
    const mPartNotes = key.match(/^parts\[(\d+)\]\[notes\]$/);
    const mRow = key.match(/^parts\[(\d+)\]\[rows\]\[(\d+)\]\[(row_number|instruction)\]$/);
    const mPartIntro = key.match(/^parts\[(\d+)\]\[introText\]$/);
    const mPartOutro = key.match(/^parts\[(\d+)\]\[outroText\]$/);

    if (mPartId) {
      const pidx = mPartId[1];
      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id: "", name: "", notes: "", introText: "", outroText: "", rows: new Map() });
      partsMap.get(pidx).part_id = value;
    } else if (mPartName) {
      const pidx = mPartName[1];
      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id: "", name: "", notes: "", introText: "", outroText: "", rows: new Map() });
      partsMap.get(pidx).name = value;
    } else if (mPartNotes) {
      const pidx = mPartNotes[1];
      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id: "", name: "", notes: "", introText: "", outroText: "", rows: new Map() });
      partsMap.get(pidx).notes = value;
    } else if (mRow) {
      const pidx = mRow[1];
      const ridx = mRow[2];
      const field = mRow[3];

      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id: "", name: "", notes: "", introText: "", outroText: "", rows: new Map() });
      const partObj = partsMap.get(pidx);

      if (!partObj.rows.has(ridx)) partObj.rows.set(ridx, { row_number: null, instruction: "" });
      const rowObj = partObj.rows.get(ridx);

      if (field === "row_number") rowObj.row_number = value ? parseInt(value, 10) : null;
      if (field === "instruction") rowObj.instruction = value;
    }
    else if (mPartIntro) {
      const pidx = mPartIntro[1];
      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id:"", name:"", notes:"", introText:"", outroText:"", rows:new Map() });
      partsMap.get(pidx).introText = value;
    } else if (mPartOutro) {
      const pidx = mPartOutro[1];
      if (!partsMap.has(pidx)) partsMap.set(pidx, { part_id:"", name:"", notes:"", introText:"", outroText:"", rows:new Map() });
      partsMap.get(pidx).outroText = value;
    }
  }

  for (const [pIdx, pObj] of [...partsMap.entries()].sort((a,b)=>parseInt(a[0])-parseInt(b[0]))) {
    const rows = [...pObj.rows.entries()]
      .sort((a,b)=>parseInt(a[0])-parseInt(b[0]))
      .map(([_, row]) => row)
      .filter(r => r.row_number || (r.instruction && r.instruction.trim().length));

    const partId = pObj.part_id || crypto.randomUUID();
    const imgState = partImageState.get(partId);

    let partImage = null;
    let partImageMeta = null;

    if (imgState?.removeFlag) {
      partImage = null;
      partImageMeta = null;
    } else if (imgState?.blob) {
      partImage = imgState.blob;
      partImageMeta = imgState.meta;
    } else if (existing) {
      const oldPart = existing.parts?.find(p => p.part_id === partId);
      if (oldPart?.image) {
        partImage = oldPart.image;
        partImageMeta = oldPart.imageMeta || null;
      }
    }

    pattern.parts.push({
      part_id: partId,
      name: pObj.name,
      notes: pObj.notes,
      introText: pObj.introText || "",
      outroText: pObj.outroText || "",
      rows,
      image: partImage,
      imageMeta: partImageMeta
    });
  }

  // Bild
  if (removeImageFlag) {
    pattern.image = null;
    pattern.imageMeta = null;
  } else if (currentImageBlob) {
    pattern.image = currentImageBlob;
    pattern.imageMeta = currentImageMeta || null;
  } else if (existing?.image) {
    pattern.image = existing.image;
    pattern.imageMeta = existing.imageMeta || null;
  }

  await idbPut("patterns", pattern);

  window.location.href = `pattern.html?id=${encodeURIComponent(pattern.id)}`;
});

partsContainer?.addEventListener("input", (e) => {
  const nameInput = e.target.closest('input[name$="[name]"]');
  if (!nameInput) return;

  const card = nameInput.closest(".card");
  const titleSpan = card?.querySelector(".part-toggle span.fw-semibold");
  if (titleSpan) titleSpan.textContent = nameInput.value.trim() || "Ny del";
});

const backBtn = document.getElementById("backBtn");

if (backBtn) {
  if (editId) {
    backBtn.href = `pattern.html?id=${encodeURIComponent(editId)}`;
  } else {
    backBtn.href = "index.html";
  }
}