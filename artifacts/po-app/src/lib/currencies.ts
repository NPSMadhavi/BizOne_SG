export interface CurrencyOption {
  code: string;
  label: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "SGD", label: "SGD — Singapore Dollar", name: "Singapore Dollar", symbol: "S$" },
  { code: "USD", label: "USD — US Dollar", name: "US Dollar", symbol: "$" },
  { code: "EUR", label: "EUR — Euro", name: "Euro", symbol: "€" },
  { code: "GBP", label: "GBP — British Pound", name: "British Pound", symbol: "£" },
  { code: "MYR", label: "MYR — Malaysian Ringgit", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "INR", label: "INR — Indian Rupee", name: "Indian Rupee", symbol: "₹" },
  { code: "AUD", label: "AUD — Australian Dollar", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "CAD — Canadian Dollar", name: "Canadian Dollar", symbol: "C$" },
  { code: "JPY", label: "JPY — Japanese Yen", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "CNY — Chinese Yuan", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", label: "HKD — Hong Kong Dollar", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "THB", label: "THB — Thai Baht", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", label: "IDR — Indonesian Rupiah", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "PHP", label: "PHP — Philippine Peso", name: "Philippine Peso", symbol: "₱" },
  { code: "AED", label: "AED — UAE Dirham", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", label: "SAR — Saudi Riyal", name: "Saudi Riyal", symbol: "SAR" },
  { code: "CHF", label: "CHF — Swiss Franc", name: "Swiss Franc", symbol: "CHF" },
  { code: "NZD", label: "NZD — New Zealand Dollar", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "KRW", label: "KRW — South Korean Won", name: "South Korean Won", symbol: "₩" },
  { code: "TWD", label: "TWD — New Taiwan Dollar", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "VND", label: "VND — Vietnamese Dong", name: "Vietnamese Dong", symbol: "₫" },
  { code: "ZAR", label: "ZAR — South African Rand", name: "South African Rand", symbol: "R" },
  { code: "BND", label: "BND — Brunei Dollar", name: "Brunei Dollar", symbol: "B$" },
  { code: "QAR", label: "QAR — Qatari Riyal", name: "Qatari Riyal", symbol: "QR" },
  { code: "KWD", label: "KWD — Kuwaiti Dinar", name: "Kuwaiti Dinar", symbol: "KD" },
  { code: "BHD", label: "BHD — Bahraini Dinar", name: "Bahraini Dinar", symbol: "BD" },
  { code: "OMR", label: "OMR — Omani Rial", name: "Omani Rial", symbol: "OMR" },
];

export const CURRENCY_LOCALE: Record<string, string> = {
  SGD: "en-SG",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  MYR: "ms-MY",
  INR: "en-IN",
  AUD: "en-AU",
  CAD: "en-CA",
  JPY: "ja-JP",
  CNY: "zh-CN",
  HKD: "zh-HK",
  THB: "th-TH",
  IDR: "id-ID",
  PHP: "en-PH",
  AED: "en-AE",
  SAR: "en-SA",
  CHF: "de-CH",
  NZD: "en-NZ",
  KRW: "ko-KR",
  TWD: "zh-TW",
  VND: "vi-VN",
  ZAR: "en-ZA",
  BND: "ms-BN",
  QAR: "ar-QA",
  KWD: "ar-KW",
  BHD: "ar-BH",
  OMR: "ar-OM",
};

/**
 * Normalizes any currency string (short code, full name, symbol, or noisy text like
 * "document Indian rupees", "US dollars", "INR", "₹") into a valid 3-letter ISO code.
 */
export function normalizeCurrency(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "SGD";

  // Clean and remove common filler words
  const raw = input.trim();
  const cleaned = raw
    .toLowerCase()
    .replace(/\b(document|invoice|quotation|quote|po|order|currency|curr|code|in|set|to|as|the|amount|price)\b/gi, " ")
    .replace(/[^\w\s$€£₹¥฿₱₫]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const upper = raw.toUpperCase().trim();

  // 1. Direct exact 3-letter match
  if (CURRENCIES.some(c => c.code === upper)) return upper;

  // 2. Look for 3-letter codes in the cleaned or raw string
  const codeMatch = upper.match(/\b([A-Z]{3})\b/);
  if (codeMatch && CURRENCIES.some(c => c.code === codeMatch[1])) {
    return codeMatch[1];
  }

  // 3. Name and symbol pattern matching
  if (/\b(inr|rupee|rupees|rs|inr\b|₹)/i.test(cleaned)) return "INR";
  if (/\b(sgd|singapore|sing\s*dollar|s\$)/i.test(cleaned)) return "SGD";
  if (/\b(usd|us\s*dollar|united\s*states\s*dollar|dollar|dollars|\$)/i.test(cleaned)) return "USD";
  if (/\b(eur|euro|euros|€)/i.test(cleaned)) return "EUR";
  if (/\b(gbp|pound|pounds|sterling|quid|£)/i.test(cleaned)) return "GBP";
  if (/\b(myr|ringgit|rm)/i.test(cleaned)) return "MYR";
  if (/\b(aud|aussie|australian\s*dollar|a\$)/i.test(cleaned)) return "AUD";
  if (/\b(cad|canadian\s*dollar|c\$)/i.test(cleaned)) return "CAD";
  if (/\b(jpy|yen|japanese\s*yen|¥)/i.test(cleaned)) return "JPY";
  if (/\b(cny|rmb|yuan|renminbi|chinese\s*yuan)/i.test(cleaned)) return "CNY";
  if (/\b(hkd|hong\s*kong\s*dollar|hk\$)/i.test(cleaned)) return "HKD";
  if (/\b(thb|baht|thai\s*baht|฿)/i.test(cleaned)) return "THB";
  if (/\b(idr|rupiah|indonesian\s*rupiah|rp)/i.test(cleaned)) return "IDR";
  if (/\b(php|peso|pesos|philippine\s*peso|₱)/i.test(cleaned)) return "PHP";
  if (/\b(aed|dirham|dirhams|uae\s*dirham)/i.test(cleaned)) return "AED";
  if (/\b(sar|riyal|riyals|saudi\s*riyal)/i.test(cleaned)) return "SAR";
  if (/\b(chf|franc|francs|swiss\s*franc)/i.test(cleaned)) return "CHF";
  if (/\b(nzd|new\s*zealand\s*dollar|nz\$)/i.test(cleaned)) return "NZD";
  if (/\b(krw|won|korean\s*won|₩)/i.test(cleaned)) return "KRW";
  if (/\b(twd|taiwan\s*dollar|nt\$)/i.test(cleaned)) return "TWD";
  if (/\b(vnd|dong|vietnamese\s*dong|₫)/i.test(cleaned)) return "VND";
  if (/\b(zar|rand|south\s*african\s*rand)/i.test(cleaned)) return "ZAR";

  // 4. Any uppercase 3 letters
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  return "SGD";
}

/**
 * Format a number as currency safely.
 * Never throws RangeError: Invalid currency code under any circumstance.
 */
export function formatCurrency(value: number, currencyInput?: string): string {
  const num = Number(value) || 0;
  const code = normalizeCurrency(currencyInput);
  const locale = CURRENCY_LOCALE[code] || "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${code} ${formatted}`;
  }
}
