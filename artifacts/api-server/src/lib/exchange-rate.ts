/**
 * Exchange rate utility using @fawazahmed0/currency-api via jsDelivr CDN and Cloudflare Pages fallback.
 * Free, no API key required. Supports historical rates (by date) and latest rates.
 * IRAS-accepted source for SGD GST conversion calculations.
 */

interface CacheEntry {
  rate: number;
  resolvedDate: string;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 min

async function fetchFromUrl(url: string, from: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, Record<string, number>>;
    const rate = data[from]?.sgd;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Fetch exchange rate info from `currency` to SGD with fallback to latest date if historical is unavailable.
 */
export async function getExchangeRateInfo(
  currency: string,
  date?: string
): Promise<{ rate: number; resolvedDate: string }> {
  const upper = currency.toUpperCase();
  if (upper === "SGD") return { rate: 1.0, resolvedDate: date || "latest" };

  const from = upper.toLowerCase();
  const dateTag = date && date !== "latest" ? date : "latest";
  const key = `${from}_${dateTag}`;

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) {
    return { rate: cached.rate, resolvedDate: cached.resolvedDate };
  }

  let rate: number | null = null;
  let resolvedDate = dateTag;

  // 1. Try date-specific if specified and not "latest"
  if (dateTag !== "latest") {
    rate = await fetchFromUrl(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateTag}/v1/currencies/${from}.min.json`,
      from
    );
  }

  // 2. Fall back to latest on jsDelivr
  if (rate == null) {
    rate = await fetchFromUrl(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from}.min.json`,
      from
    );
    if (rate != null) {
      resolvedDate = "latest";
    }
  }

  // 3. Fall back to Cloudflare Pages CDN
  if (rate == null) {
    rate = await fetchFromUrl(
      `https://latest.currency-api.pages.dev/v1/currencies/${from}.json`,
      from
    );
    if (rate != null) {
      resolvedDate = "latest";
    }
  }

  if (rate == null) {
    throw new Error(`Exchange rate could not be retrieved for ${currency} (${dateTag})`);
  }

  cache.set(key, { rate, resolvedDate, expires: Date.now() + TTL_MS });
  return { rate, resolvedDate };
}

/**
 * Fetch exchange rate from `currency` to SGD.
 * @param currency  ISO 4217 code, e.g. "USD", "EUR", "GBP"
 * @param date      YYYY-MM-DD for historical; omit / use "latest" for today's rate
 * @returns rate    How many SGD = 1 unit of `currency`
 */
export async function getExchangeRateToSGD(currency: string, date?: string): Promise<number> {
  const info = await getExchangeRateInfo(currency, date);
  return info.rate;
}

/** List of supported currencies that can be converted to SGD */
export const SUPPORTED_FX_CURRENCIES = [
  "USD", "EUR", "GBP", "MYR", "CNY", "JPY", "AUD", "HKD", "INR", "THB",
  "IDR", "PHP", "AED", "SAR", "CHF", "NZD", "KRW", "TWD", "VND", "ZAR",
  "BND", "QAR", "KWD", "BHD", "OMR"
];
