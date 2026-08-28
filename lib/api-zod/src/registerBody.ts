import * as zod from "zod";

function sgPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("65") && digits.length > 8) digits = digits.slice(2);
  return digits;
}

export const RegisterBody = zod.object({
  fullName: zod.string().min(2, "Full name is required"),
  email: zod.string().email("Valid email is required"),
  password: zod.string().min(6, "Password must be at least 6 characters"),
  phoneNumber: zod
    .string()
    .min(1, "Phone number is required")
    .refine((val) => sgPhoneDigits(val).length === 8, {
      message: "Enter a valid 8-digit Singapore phone number (+65)",
    }),
  companyName: zod.string().min(2, "Company name is required"),
  companyEmail: zod.string().email("Valid company email is required"),
  companyAddress: zod.string().min(5, "Company address is required"),
  companyDomain: zod.string().min(3, "Company domain is required"),
  gstRegistrationNo: zod.string().optional(),
});
