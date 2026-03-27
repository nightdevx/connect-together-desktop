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
  dom.status.textContent = `Arayuz baslatilamadi: ${message}`;
  dom.status.dataset.tone = "error";
});
