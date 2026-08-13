import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapBrowserSession } from "./lib/browser-session";

async function start() {
  await bootstrapBrowserSession();
  createRoot(document.getElementById("root")!).render(<App />);
}

void start();
