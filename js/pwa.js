// js/pwa.js

function ensureUpdateToast() {
  let host = document.getElementById("pwaUpdateToastHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "pwaUpdateToastHost";
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.right = "0";
  host.style.bottom = "0";
  host.style.zIndex = "1080";
  host.style.padding = "0.75rem";
  host.style.display = "flex";
  host.style.justifyContent = "center";
  document.body.appendChild(host);
  return host;
}

function showUpdateToast(onUpdate) {
  const host = ensureUpdateToast();

  host.innerHTML = `
    <div class="toast show align-items-center text-bg-dark border" role="alert" aria-live="assertive" aria-atomic="true"
         style="max-width: 520px; width: 100%;">
      <div class="d-flex">
        <div class="toast-body">
          Ny version finns. Vill du uppdatera?
        </div>
        <div class="d-flex gap-2 align-items-center pe-2">
          <button type="button" class="btn btn-sm btn-primary" id="pwaUpdateNow">Uppdatera</button>
          <button type="button" class="btn btn-sm btn-outline-light" id="pwaUpdateLater">Sen</button>
        </div>
      </div>
    </div>
  `;

  host.querySelector("#pwaUpdateNow")?.addEventListener("click", onUpdate);
  host.querySelector("#pwaUpdateLater")?.addEventListener("click", () => {
    host.innerHTML = "";
  });
}

export async function registerPWA() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("./service-worker.js");

    // Om det redan finns en waiting SW (t.ex. efter reload)
    if (reg.waiting) {
      showUpdateToast(() => {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      });
    }

    // När en ny version hittas
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // Ny version redo, men väntar
          showUpdateToast(() => {
            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          });
        }
      });
    });

    // När nya SW tar kontroll → reload för att få nya assets
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

  } catch (err) {
    console.warn("Service worker kunde inte registreras:", err);
  }
}

const banner = document.getElementById("offline-banner");

let wasOffline = !navigator.onLine;

function updateOnlineStatus(event) {
  const banner = ensureOfflineBanner();

  if (!navigator.onLine) {
    wasOffline = true;

    banner.textContent = "Du är offline";
    banner.style.background = "#dc3545";
    banner.classList.remove("d-none");
    return;
  }

  // Om vi är online men aldrig varit offline → visa inget
  if (!wasOffline) return;

  // Vi var offline och är nu online → visa återkoppling
  banner.textContent = "Du är online igen";
  banner.style.background = "#198754";
  banner.classList.remove("d-none");

  setTimeout(() => {
    banner.classList.add("d-none");
  }, 2000);

  wasOffline = false;
}

// Lyssna bara på faktiska förändringar
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// Kör bara initial offline-visa, inte online
if (!navigator.onLine) {
  updateOnlineStatus();
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// Visa bara om vi faktiskt startar offline
if (!navigator.onLine) {
  updateOnlineStatus();
}