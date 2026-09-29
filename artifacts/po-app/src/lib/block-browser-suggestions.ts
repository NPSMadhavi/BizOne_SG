/** Token Chrome/Edge won't treat as a credential or address autofill hint. */
export const AUTOFILL_BLOCK_TOKEN = "nope";

/** Legitimate auth autocomplete values — only kept when data-allow-autofill="true". */
const AUTH_AUTOCOMPLETE =
  /^(username|email|current-password|new-password|one-time-code|tel|tel-national|name|given-name|family-name)$/i;

/** Values that trigger browser address, email, name, credential, or history UI. */
const SUGGESTION_TRIGGER =
  /^(on|off)$|address|email|tel|username|password|name|postal|street|organization|country|honorific|given-name|family-name|cc-|bday|shipping|billing|contact|person|phone|vendor|customer|emp|pin|code|search/i;

function isAutofillAllowed(el: HTMLElement): boolean {
  return el.dataset.allowAutofill === "true";
}

function skipField(el: HTMLInputElement | HTMLTextAreaElement) {
  if (isAutofillAllowed(el)) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return [
    "hidden",
    "checkbox",
    "radio",
    "file",
    "submit",
    "button",
    "range",
    "color",
    "date",
    "time",
    "datetime-local",
    "month",
    "week",
  ].includes(el.type);
}

let nameSeq = 0;

/** Always unique name so Chrome cannot match prior form-history suggestions. */
export function neutralizeAutofillName(name: string | undefined): string {
  nameSeq += 1;
  const base = (name || "field").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24);
  return `nf_${base}_${Date.now().toString(36)}_${nameSeq}`;
}

/** Fresh autocomplete token per field instance. */
export function makeAutofillBlockToken(): string {
  return `nf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve autocomplete for shared Input/Textarea (and callers). */
export function resolveBlockedAutocomplete(
  autoComplete: string | undefined,
  options?: { allowAutofill?: boolean; uniqueToken?: string },
): string {
  if (options?.allowAutofill) {
    return autoComplete && autoComplete.length > 0 ? autoComplete : "on";
  }
  // Always use a unique non-standard token — static "off"/"nope" still gets history UI.
  if (!autoComplete || SUGGESTION_TRIGGER.test(autoComplete) || AUTH_AUTOCOMPLETE.test(autoComplete)) {
    return options?.uniqueToken || makeAutofillBlockToken();
  }
  return options?.uniqueToken || autoComplete;
}

/**
 * Strip attributes Chrome uses for profile / password / form-history suggestions.
 */
export function blockBrowserSuggestions(el: HTMLInputElement | HTMLTextAreaElement) {
  if (skipField(el)) return;

  const token = makeAutofillBlockToken();
  el.setAttribute("autocomplete", token);

  const name = el.getAttribute("name") || "";
  if (!name.startsWith("nf_")) {
    el.setAttribute("name", neutralizeAutofillName(name || "field"));
  }

  el.setAttribute("autocorrect", "off");
  el.setAttribute("autocapitalize", "off");
  el.setAttribute("spellcheck", "false");
  el.setAttribute("data-1p-ignore", "true");
  el.setAttribute("data-lpignore", "true");
  el.setAttribute("data-form-type", "other");
  el.setAttribute("data-bwignore", "true");
  el.setAttribute("data-gtm-ignore", "true");
  el.setAttribute("role", "presentation");

  if (el instanceof HTMLInputElement && (el.type === "email" || el.type === "tel" || el.type === "password")) {
    if (el.type === "email" || el.type === "tel") {
      el.setAttribute("inputmode", el.type === "email" ? "email" : "numeric");
      el.type = "text";
    }
  }
}

export function blockBrowserSuggestionsIn(root: ParentNode) {
  if (root instanceof HTMLFormElement && !isAutofillAllowed(root)) {
    root.setAttribute("autocomplete", "off");
  }
  if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) {
    blockBrowserSuggestions(root);
  }
  root.querySelectorAll?.("form").forEach((form) => {
    if (!isAutofillAllowed(form as HTMLElement)) {
      form.setAttribute("autocomplete", "off");
    }
  });
  root.querySelectorAll?.("input, textarea").forEach((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      blockBrowserSuggestions(node);
    }
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

  const hardenFocused = (target: EventTarget | null) => {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (isAutofillAllowed(target)) return;
    if (target.readOnly && target.dataset.autofillLock === "1") {
      target.readOnly = false;
      target.removeAttribute("readonly");
    }
    blockBrowserSuggestions(target);
  };

  document.addEventListener("mousedown", (event) => {
    hardenFocused(event.target);
    scan(event.target as Node);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    hardenFocused(event.target);
  }, true);
  document.addEventListener("focusin", (event) => {
    hardenFocused(event.target);
    scan(event.target as Node);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      // Next field will focus soon — harden current before history UI attaches
      hardenFocused(event.target);
    }
  }, true);
}
