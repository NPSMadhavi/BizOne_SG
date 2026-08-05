import { Check } from "lucide-react";
import { Link } from "wouter";

const plans = [
  {
    name: "Starter",
    subtitle: "For a single growing company getting organized",
    price: "Contact Us",
    popular: false,
    features: [
      "Up to 1 Company",
      "Up to 10 Users",
      "Sales & Purchase",
      "Inventory Management",
      "GST Reports",
      "Email Support",
    ],
  },
  {
    name: "Growth",
    subtitle: "For multi-company teams that need it all connected",
    price: "Contact Us",
    popular: true,
    features: [
      "Up to 10 Companies",
      "Up to 100 Users",
      "All ERP Modules",
      "Manufacturing",
      "HR & Payroll",
      "Analytics Dashboard",
      "Priority Support",
    ],
  },
  {
    name: "Enterprise",
    subtitle: "For large groups with advanced governance needs",
    price: "Custom",
    popular: false,
    features: [
      "Unlimited Companies",
      "Unlimited Users",
      "All Business Modules",
      "Custom Integrations",
      "Dedicated Support",
      "99.9% SLA",
    ],
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-[#F9FAFB] py-16">
      <div className="mx-auto max-w-7xl px-6">

        {/* Badge */}
        <div className="flex justify-center">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-medium text-blue-700">
            ✦ Pricing & Plans
          </span>
        </div>

        {/* Heading */}
        <h2 className="mx-auto mt-6 max-w-4xl text-center text-5xl font-semibold text-[#101828]">
          Plans that scale with your group
        </h2>

        <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-[#667085]">
          Start free, then choose the plan that fits. Talk to us for pricing tailored to your company count and modules.
        </p>

        {/* Pricing Cards */}
        <div className="mt-20 grid gap-8 lg:grid-cols-3">

          {plans.map((plan) => (
            <div
              key={plan.name}
              className="relative rounded-[32px] border bg-white p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-[#4F46E5]"
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#4F46E5] px-5 py-2 text-sm font-semibold text-white shadow-lg">
                  Most Popular
                </div>
              )}

              <h3 className="text-md font-semibold text-[#101828]">
                {plan.name}
              </h3>

              <p className="mt-3 text-sm text-[#667085]">
                {plan.subtitle}
              </p>

              <div className="mt-8">
                <h1 className="text-3xl font-semibold text-[#101828]">
                  {plan.price}
                </h1>
              </div>

              {/* <button
                className={`mt-8 w-full rounded-xl py-4 font-medium transition-all duration-300
                ${
                    plan.popular
                    ? "bg-[#4F46E5] text-white hover:bg-gradient-to-r hover:from-[#002E99] hover:via-[#0072F8] hover:to-[#009FFF]"
                    : "border border-gray-300 bg-white text-[#101828] hover:border-transparent hover:bg-gradient-to-r hover:from-[#002E99] hover:via-[#0072F8] hover:to-[#009FFF] hover:text-white"
                }`}
                >
                Start free plan
              </button> */}
              <Link
                href="/register"
                className="
    mt-8
    block
    w-full
    rounded-xl
    border
    border-gray-300
    bg-white
    py-4
    text-center
    font-medium
    text-[#101828]
    transition-all
    duration-300
    hover:border-transparent
    hover:bg-gradient-to-r
    hover:from-[#002E99]
    hover:via-[#0072F8]
    hover:to-[#009FFF]
    hover:text-white
  "
              >
                Start free plan
              </Link>
              

              <div className="mt-10 space-y-5">
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                      <Check
                        size={15}
                        className="text-green-600"
                      />
                    </div>

                    <span className="text-[#475467]">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>

      </div>
    </section>
  );
}