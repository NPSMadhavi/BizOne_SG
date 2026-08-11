/** True when company country is Singapore (full name or ISO code SG). */
export function isSingaporeCountry(country: string | null | undefined): boolean {
  const c = (country || "").trim().toLowerCase();
  return c === "singapore" || c === "sg" || c === "singapore, sg";
}
