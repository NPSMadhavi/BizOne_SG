const SINGAPORE_TAX_BRACKETS = [
  { limit: 20000, rate: 0 },
  { limit: 10000, rate: 0.02 },
  { limit: 10000, rate: 0.035 },
  { limit: 40000, rate: 0.07 },
  { limit: 40000, rate: 0.115 },
  { limit: 40000, rate: 0.15 },
  { limit: 40000, rate: 0.18 },
  { limit: 40000, rate: 0.19 },
  { limit: 40000, rate: 0.195 },
  { limit: 40000, rate: 0.2 },
  { limit: 180000, rate: 0.22 },
  { limit: 500000, rate: 0.23 },
  { limit: Infinity, rate: 0.24 },
] as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateSingaporeAnnualTax(annualIncome: number) {
  if (!annualIncome || annualIncome <= 0) {
    return {
      annualTax: 0,
      taxBracket: "0% (S$0 - S$20,000)",
    };
  }

  let remainingIncome = annualIncome;
  let tax = 0;
  let lowerBound = 0;
  let currentBracket = "24% (Above S$1,000,000)";

  for (const bracket of SINGAPORE_TAX_BRACKETS) {
    if (remainingIncome <= 0) break;

    const taxableAmount = Math.min(remainingIncome, bracket.limit);
    tax += taxableAmount * bracket.rate;

    const upperBound = bracket.limit === Infinity ? Infinity : lowerBound + bracket.limit;
    if (annualIncome > lowerBound && annualIncome <= upperBound) {
      currentBracket =
        bracket.limit === Infinity
          ? "24% (Above S$1,000,000)"
          : `${(bracket.rate * 100).toFixed(1).replace(/\.0$/, "")}% (S$${lowerBound.toLocaleString()} - S$${upperBound.toLocaleString()})`;
    }

    remainingIncome -= taxableAmount;
    lowerBound += bracket.limit === Infinity ? 0 : bracket.limit;
  }

  return {
    annualTax: round2(tax),
    taxBracket: currentBracket,
  };
}

export function calculateSingaporeMonthlyTax(monthlySalary: number) {
  const monthlyIncome = Number(monthlySalary) || 0;
  const annualIncome = round2(monthlyIncome * 12);
  const { annualTax, taxBracket } = calculateSingaporeAnnualTax(annualIncome);
  const monthlyTax = round2(annualTax / 12);

  return {
    monthlySalary: round2(monthlyIncome),
    annualIncome,
    annualTax,
    monthlyTax,
    effectiveTaxRate: annualIncome > 0 ? round2((annualTax / annualIncome) * 100) : 0,
    taxBracket,
  };
}
