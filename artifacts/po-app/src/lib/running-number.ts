/** Preview the next document number from settings without consuming the counter. */
export function previewRunningNumber(
  prefix: string | null | undefined,
  counter: number | string | null | undefined,
  suffix: string | null | undefined,
): string {
  const n = (parseInt(String(counter ?? 0), 10) || 0) + 1;
  return `${prefix ?? ""}${n}${suffix ?? ""}`;
}
