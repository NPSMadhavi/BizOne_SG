import { useEffect, useRef } from "react";

export type VedaFormAction = "save" | "preview" | "download";

const PENDING_KEY = "__vedaPendingFormAction";

export function queueVedaFormAction(action: VedaFormAction) {
  (window as any)[PENDING_KEY] = action;
  window.dispatchEvent(new CustomEvent("veda:form-action", { detail: { action } }));
}

/**
 * Listen for Veda save / preview / download actions on the open document page.
 * Also consumes a pending action queued before navigation (list → view/edit).
 */
export function useVedaFormActions(handlers: {
  onSave?: () => void;
  onPreview?: () => void;
  onDownload?: () => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const run = (action?: VedaFormAction) => {
      if (action === "save") ref.current.onSave?.();
      else if (action === "preview") ref.current.onPreview?.();
      else if (action === "download") ref.current.onDownload?.();
    };

    const handler = (e: Event) => {
      run((e as CustomEvent<{ action?: VedaFormAction }>).detail?.action);
    };
    window.addEventListener("veda:form-action", handler);

    const pending = (window as any)[PENDING_KEY] as VedaFormAction | undefined;
    if (pending) {
      (window as any)[PENDING_KEY] = null;
      const t = window.setTimeout(() => run(pending), 250);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("veda:form-action", handler);
      };
    }

    return () => window.removeEventListener("veda:form-action", handler);
  }, []);
}
