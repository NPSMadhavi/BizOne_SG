/**
 * Exchange rate utility using @fawazahmed0/currency-api via jsDelivr CDN.
 * Free, no API key required. Supports historical rates (by date) and latest rates.
 * IRAS-accepted source for SGD GST conversion calculations.
 */

interface CacheEntry { rate: number; expires: number; }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * Fetch exchange rate from `currency` to SGD.
 * @param currency  ISO 4217 code, e.g. "USD", "EUR", "GBP"
 * @param date      YYYY-MM-DD for historical; omit / use "latest" for today's rate
 * @returns rate    How many SGD = 1 unit of `currency`
 */
export async function getExchangeRateToSGD(currency: string, date?: string): Promise<number> {
  const upper = currency.toUpperCase();
  if (upper === "SGD") return 1.0;

  const from = upper.toLowerCase();
  const dateTag = date && date !== "latest" ? date : "latest";
  const key = `${from}_${dateTag}`;

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) return cached.rate;

  // Primary: fawazahmed0/currency-api via jsDelivr
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateTag}/v1/currencies/${from}.min.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Exchange rate fetch failed (${res.status}) for ${currency} on ${dateTag}`);

  const data = await res.json() as Record<string, Record<string, number>>;
  const rate = data[from]?.sgd;
  if (!rate || typeof rate !== "number") {
    throw new Error(`SGD rate not found in response for ${currency}`);
  }

  cache.set(key, { rate, expires: Date.now() + TTL_MS });
  return rate;
}

/** List of supported currencies that can be converted to SGD */
export const SUPPORTED_FX_CURRENCIES = ["USD", "EUR", "GBP", "MYR", "CNY", "JPY", "AUD", "HKD", "INR", "THB"];
