import * as zod from "zod";

function sgPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("65") && digits.length > 8) digits = digits.slice(2);
  return digits;
}

export const RegisterBody = zod.object({
  fullName: zod.string().min(2, "Full name is required"),
  email: zod.string().email("Valid email is required"),
  // Any length — no fixed character count. Composition rules only.
  password: zod
    .string()
    .min(1, "Password is required")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
      "Password must include a capital letter, a small letter, a number, and a special character",
    ),
  phoneNumber: zod
    .string()
    .min(1, "Phone number is required")
    .refine((val) => sgPhoneDigits(val).length === 8, {
      message: "Enter a valid 8-digit Singapore phone number (+65)",
    }),
  companyName: zod.string().min(2, "Company name is required"),
  companyEmail: zod.string().email("Valid company email is required"),
  companyAddress: zod.string().min(5, "Company address is required"),
  companyDomain: zod.string().min(3).optional(),
  businessType: zod.enum(["trading", "trading_services", "non_trading", "shopping_malls", "manufacturing"], {
    errorMap: () => ({ message: "Select a business type" }),
  }),
  gstRegistrationNo: zod.string().optional(),
  financialYearFrom: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the financial year start date"),
  financialYearTo: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the financial year end date"),
  slug: zod
    .string()
    .min(3, "Company slug is required")
    .regex(/^[a-z0-9]+$/, "Slug can contain only letters and numbers"),
});
