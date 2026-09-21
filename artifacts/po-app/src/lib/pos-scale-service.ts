/**
 * POS weighing-scale integration layer.
 * Frontend never talks to USB/RS-232 directly — it uses this provider.
 * Swap HttpScaleProvider / ManualWeightProvider without changing POS UI.
 */

export type ScaleStatus = "connected" | "disconnected" | "error" | "unsupported";

export type ScaleReading = {
  status: ScaleStatus;
  weightKg: number | null;
  message?: string | null;
};

export interface WeightProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ScaleStatus>;
  getCurrentWeight(): Promise<number | null>;
  getReading(): Promise<ScaleReading>;
}

/** Calls API bridge that a local scale service can feed. */
export class HttpScaleProvider implements WeightProvider {
  private lastStatus: ScaleStatus = "disconnected";

  async connect(): Promise<void> {
    await this.getReading();
  }

  async disconnect(): Promise<void> {
    try {
      await fetch("/api/pos/scale/disconnect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // ignore
    }
    this.lastStatus = "disconnected";
  }

  async getStatus(): Promise<ScaleStatus> {
    const reading = await this.getReading();
    return reading.status;
  }

  async getCurrentWeight(): Promise<number | null> {
    const reading = await this.getReading();
    return reading.weightKg;
  }

  async getReading(): Promise<ScaleReading> {
    try {
      const res = await fetch("/api/pos/scale/status", { credentials: "include" });
      if (!res.ok) {
        this.lastStatus = "error";
        return { status: "error", weightKg: null, message: "Unable to reach scale service." };
      }
      const data = await res.json();
      const status = (data.status as ScaleStatus) || "disconnected";
      this.lastStatus = status;
      const weightKg = data.weightKg != null && Number.isFinite(Number(data.weightKg))
        ? Math.round(Number(data.weightKg) * 1000) / 1000
        : null;
      return {
        status,
        weightKg: weightKg != null && weightKg > 0 ? weightKg : null,
        message: data.message || null,
      };
    } catch {
      this.lastStatus = "disconnected";
      return {
        status: "disconnected",
        weightKg: null,
        message: null,
      };
    }
  }
}

export class ManualWeightProvider implements WeightProvider {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async getStatus(): Promise<ScaleStatus> {
    return "disconnected";
  }
  async getCurrentWeight(): Promise<number | null> {
    return null;
  }
  async getReading(): Promise<ScaleReading> {
    return {
      status: "disconnected",
      weightKg: null,
      message: null,
    };
  }
}

let activeProvider: WeightProvider = new HttpScaleProvider();

export function getScaleService(): WeightProvider {
  return activeProvider;
}

export function setScaleService(provider: WeightProvider) {
  activeProvider = provider;
}

/** Parse cashier input like "500g", "0.5", "1kg", "1.25kg" into kilograms. */
export function parseWeightInputToKg(raw: string): number | null {
  const text = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  const gramMatch = text.match(/^(\d+(?:\.\d+)?)\s*g(?:ram)?s?$/);
  if (gramMatch) {
    const g = parseFloat(gramMatch[1]);
    if (!Number.isFinite(g) || g < 0) return null;
    return Math.round((g / 1000) * 1000) / 1000;
  }

  const kgMatch = text.match(/^(\d+(?:\.\d+)?)\s*k(?:g|ilo(?:gram)?s?)?$/);
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1]);
    if (!Number.isFinite(kg) || kg < 0) return null;
    return Math.round(kg * 1000) / 1000;
  }

  const plain = parseFloat(text);
  if (!Number.isFinite(plain) || plain < 0) return null;
  // Bare numbers: values >= 10 treated as grams (e.g. 500 → 0.5kg), else kilograms
  if (plain >= 10) return Math.round((plain / 1000) * 1000) / 1000;
  return Math.round(plain * 1000) / 1000;
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function amountFromWeight(weightKg: number, pricePerKg: number): number {
  return roundMoney(weightKg * pricePerKg);
}

/**
 * Convert a Sub UOM label into a fraction of the parent UOM.
 * Examples: "100 grams" → 0.1 (of Kg), "1/2 Box" → 0.5, "250 ml" → 0.25 (of Litre)
 */
export function parseSubUomFactor(raw: string, _parentUom?: string): number | null {
  const text = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  const fracMatch = text.match(/^(\d+)\s*\/\s*(\d+)(?:\s+|$)/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * 1000) / 1000;
    }
  }

  const compact = text.replace(/\s+/g, "");
  const mlMatch = compact.match(/^(\d+(?:\.\d+)?)ml(?:ilitre)?s?$/);
  if (mlMatch) {
    const ml = parseFloat(mlMatch[1]);
    if (!Number.isFinite(ml) || ml < 0) return null;
    return Math.round((ml / 1000) * 1000) / 1000;
  }

  const litreMatch = compact.match(/^(\d+(?:\.\d+)?)l(?:itre)?s?$/);
  if (litreMatch) {
    const L = parseFloat(litreMatch[1]);
    if (!Number.isFinite(L) || L < 0) return null;
    return Math.round(L * 1000) / 1000;
  }

  if (/^1\s+\S+/.test(text) || compact === "1") {
    return 1;
  }

  return parseWeightInputToKg(raw);
}
