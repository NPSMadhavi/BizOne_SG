const slug = `signtest${Date.now().toString(36).slice(-6)}`;
const body = {
  fullName: "Sign Test",
  email: `${slug}@example.com`,
  password: "Admin@12",
  phoneNumber: "+65 1234 5678",
  companyName: `Sign Test ${slug}`,
  companyEmail: `${slug}@example.com`,
  companyAddress: "Singapore SG",
  gstRegistrationNo: "",
  slug,
  businessType: "trading_services",
  financialYearFrom: "2026-01-01",
  financialYearTo: "2026-12-31",
};

const res = await fetch("http://localhost:8080/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 1000));
