import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";

export function useVedaFormFill(form: UseFormReturn<any>) {
  useEffect(() => {
    const handler = (e: Event) => {
      const fields = (e as CustomEvent<Record<string, unknown>>).detail;
      if (!fields || typeof fields !== "object") return;
      Object.entries(fields).forEach(([key, value]) => {
        form.setValue(key as any, value as any, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      });
    };
    window.addEventListener("veda:fill-form", handler);
    return () => window.removeEventListener("veda:fill-form", handler);
  }, [form]);
}
