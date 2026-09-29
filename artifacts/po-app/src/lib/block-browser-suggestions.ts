const SUGGESTION_TOKEN = /^(on|off)$|address|email|tel|name|postal|street|organization|username|country|honorific|given-name|family-name|cc-|bday/i;

function skipField(el: HTMLInputElement | HTMLTextAreaElement) {
  if (el.dataset.allowAutofill === "true") return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return ["password", "hidden", "checkbox", "radio", "file", "submit", "button", "range", "color", "date", "time", "datetime-local", "month", "week"].includes(el.type);
}

/** Chrome ignores autocomplete="off" and still opens the saved-address list. */
export function blockBrowserSuggestions(el: HTMLInputElement | HTMLTextAreaElement) {
  if (skipField(el)) return;
  const current = el.getAttribute("autocomplete") ?? "";
  if (!current || SUGGESTION_TOKEN.test(current)) {
    el.setAttribute("autocomplete", "new-password");
  }
  el.setAttribute("autocorrect", "off");
  el.setAttribute("data-1p-ignore", "true");
  el.setAttribute("data-lpignore", "true");
  if (el instanceof HTMLInputElement && (el.type === "email" || el.type === "tel")) {
    el.setAttribute("inputmode", el.type === "email" ? "email" : "numeric");
    el.type = "text";
  }
}

export function blockBrowserSuggestionsIn(root: ParentNode) {
  if (root instanceof HTMLFormElement) root.setAttribute("autocomplete", "off");
  if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) blockBrowserSuggestions(root);
  root.querySelectorAll?.("form").forEach((form) => form.setAttribute("autocomplete", "off"));
  root.querySelectorAll?.("input, textarea").forEach((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) blockBrowserSuggestions(node);
  });
}

export function installBrowserSuggestionBlocker() {
  const scan = (node: Node) => {
    if (node instanceof Element) blockBrowserSuggestionsIn(node);
  };
  scan(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("mousedown", (event) => scan(event.target as Node), true);
  document.addEventListener("focusin", (event) => scan(event.target as Node), true);
}
