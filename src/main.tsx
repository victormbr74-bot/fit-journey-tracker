import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/fitchat-sw.js").catch((error) => {
      console.error("Erro ao registrar service worker do FitChat:", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
