import "./styles/app.css";
import { bootstrapDesktopApp } from "./app/bootstrap";
import { queryDomRefs } from "./ui/dom";
import { buildDesktopLayout } from "./ui/layout";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Renderer root not found");
}

root.innerHTML = buildDesktopLayout();
const dom = queryDomRefs();

void bootstrapDesktopApp(dom).catch((error) => {
  const message = error instanceof Error ? error.message : "bilinmeyen hata";
  const toast = document.createElement("div");
  toast.className = "app-toast app-toast--error visible";
  toast.innerHTML = `
    <p class="app-toast-message">Arayuz baslatilamadi: ${message}</p>
    <button type="button" class="app-toast-close">Kapat</button>
  `;

  const closeButton = toast.querySelector(".app-toast-close");
  closeButton?.addEventListener("click", () => {
    toast.remove();
  });

  dom.toastContainer.appendChild(toast);
  console.error("Renderer bootstrap failed", error);
});
