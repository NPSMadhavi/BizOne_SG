import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapBrowserSession } from "./lib/browser-session";

// Suppress benign browser noise before Vite/Replit runtime overlays see it.
// Chrome fires ErrorEvents with null `error` for ResizeObserver loops (common
// when opening Radix Dialog/Popover), which the overlay shows as
// "(unknown runtime error)" with a blank body.
if (import.meta.env.DEV) {
  const isBenignNoise = (message: string, error: unknown) => {
    if (error == null && (!message || /ResizeObserver|Script error/i.test(message))) return true;
    if (/ResizeObserver loop/i.test(message)) return true;
    return false;
  };

  window.addEventListener(
    "error",
    (event) => {
      if (isBenignNoise(event.message || "", event.error)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      if (reason == null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // SpeechRecognition / Media errors are Event-like, not Error instances
      if (typeof reason === "object" && !(reason instanceof Error) && "error" in (reason as object)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

async function start() {
  await bootstrapBrowserSession();
  createRoot(document.getElementById("root")!).render(<App />);
}

void start();
