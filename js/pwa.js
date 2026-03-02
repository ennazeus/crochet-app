// js/pwa.js
console.log("PWA JS loaded");
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

function ensureOfflineBanner() {
  let banner = document.getElementById("offline-banner");
  if (banner) return banner;

  banner = document.createElement("div");
  banner.id = "offline-banner";
  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.width = "100%";
  banner.style.padding = "8px";
  banner.style.textAlign = "center";
  banner.style.color = "white";
  banner.style.fontWeight = "500";
  banner.style.zIndex = "2000";
  banner.style.display = "none";
  document.body.appendChild(banner);

  return banner;
}

let wasOffline = !navigator.onLine;

function updateOnlineStatus() {

  console.log("updateOnlineStatus fired", navigator.onLine);
  const banner = ensureOfflineBanner();

  if (!navigator.onLine) {
    wasOffline = true;
    banner.textContent = "Du är offline";
    banner.style.background = "#dc3545";
    banner.style.display = "block";
    return;
  }

  if (!wasOffline) return;

  banner.textContent = "Du är online igen";
  banner.style.background = "#198754";
  banner.style.display = "block";

  setTimeout(() => {
    banner.style.display = "none";
  }, 2000);

  wasOffline = false;
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

document.addEventListener("DOMContentLoaded", () => {
  if (!navigator.onLine) {
    updateOnlineStatus();
  }
});

function checkConnection() {
  updateOnlineStatus();
}

// Poll var 3:e sekund
setInterval(checkConnection, 3000);