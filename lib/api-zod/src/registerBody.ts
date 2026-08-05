import * as zod from "zod";

export const RegisterBody = zod.object({
  fullName: zod.string().min(2, "Full name is required"),
  email: zod.string().email("Valid email is required"),
  password: zod.string().min(6, "Password must be at least 6 characters"),
  phoneNumber: zod.string().min(10, "Phone number is required"),
  companyName: zod.string().min(2, "Company name is required"),
  companyEmail: zod.string().email("Valid company email is required"),
  companyAddress: zod.string().min(5, "Company address is required"),
  companyDomain: zod.string().min(3, "Company domain is required"),
  gstRegistrationNo: zod.string().optional(),
});
