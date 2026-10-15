export const ACCOUNT_PASSWORD_MESSAGE =
  "Password must be 8 characters with a capital letter, a small letter, a number, and a special character";

export function isValidAccountPassword(value: string) {
  return value.length === 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}
