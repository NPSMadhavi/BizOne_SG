/** Singapore mobile/landline local number length (without +65). */
export const SG_PHONE_DIGITS = 8;
export const SG_PHONE_PREFIX = "+65";

/** Strip to local digits only (max 8), removing +65 / 65 prefix if present. */
export function parseSingaporePhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("65") && digits.length > SG_PHONE_DIGITS) {
    digits = digits.slice(2);
  }
  return digits.slice(0, SG_PHONE_DIGITS);
}

export function validateSingaporePhoneDigits(digits: string): string | null {
  if (!digits) return "Phone number is required";
  if (!/^\d{8}$/.test(digits)) {
    return `Enter a valid ${SG_PHONE_DIGITS}-digit Singapore phone number`;
  }
  return null;
}

/** Format for API/storage: +65 9123 4567 */
export function formatSingaporePhoneForApi(digits: string): string {
  return `${SG_PHONE_PREFIX} ${digits.slice(0, 4)} ${digits.slice(4)}`;
}

/** Validate full stored/API phone string. */
export function validateSingaporePhoneValue(value: string): boolean {
  const digits = parseSingaporePhoneDigits(value);
  return digits.length === SG_PHONE_DIGITS;
}
