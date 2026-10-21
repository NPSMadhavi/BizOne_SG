export const ACCOUNT_PASSWORD_MESSAGE =
  "Password must start with a capital letter and include a number and a special character";

export const ACCOUNT_PASSWORD_START_CAPITAL_MESSAGE =
  "Password must start with a capital letter";

/** Any length; must start with A–Z, and include a digit and a special character. */
export function isValidAccountPassword(value: string) {
  if (!value) return false;
  return /^[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

/** Live field error — capital-start first, then other rules. */
export function getAccountPasswordError(value: string): string | undefined {
  if (!value) return undefined;
  if (!/^[A-Z]/.test(value)) return ACCOUNT_PASSWORD_START_CAPITAL_MESSAGE;
  if (!/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) return ACCOUNT_PASSWORD_MESSAGE;
  return undefined;
}
