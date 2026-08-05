import {
  Store,
  ShoppingBag,
  Calculator,
  Building2,
  Factory,
  Wrench,
} from "lucide-react";

const businesses = [
  {
    icon: Store,
    title: "Small Businesses",
    description:
      "Shop owners getting organized fast",
  },
  {
    icon: ShoppingBag,
    title: "Traders",
    description:
      "Optimized performance ensures your analytics load in milliseconds",
  },
  {
    icon: Calculator,
    title: "Accountants & Professionals",
    description:
      "Invoices, quotations and reports",
  },
  {
    icon: Building2,
    title: "Large Companies",
    description:
      "Multiple companies, one platform",
  },
  {
    icon: Factory,
    title: "Manufacturers",
    description:
      "Assets, projects and service jobs",
  },
  {
    icon: Wrench,
    title: "Service Providers",
    description:
      "Engineer reports and scheduling",
  },
];

export default function WhoCanUse() {
  return (
    <section id="about" className="bg-[#F9FAFB] py-16">
      <div className="mx-auto max-w-7xl px-6">

        {/* Badge */}
        <div className="flex justify-center">
          <span className="rounded-full border border-blue-100 bg-blue-50 px-5 py-2 text-sm font-medium text-blue-700">
            ✦ Who can use BizOne
          </span>
        </div>

        {/* Heading */}
        <h2 className="mx-auto mt-6 max-w-4xl text-center text-5xl font-semibold text-[#101828]">
          Built for every size of business
        </h2>

        {/* Description */}
        <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-[#667085]">
          Whether you're a small shop owner or a growing enterprise, BizOne helps you manage your business with ease
        </p>

        {/* Cards */}
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => {
            const Icon = business.icon;

            return (
              <div
                key={business.title}
                className="group rounded-3xl border border-gray-200 bg-white p-8 transition-all duration-300 hover:-translate-y-2 hover:border-blue-500 hover:shadow-xl"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                  <Icon size={28} />
                </div>

                <h3 className="text-2xl font-semibold text-[#101828]">
                  {business.title}
                </h3>

                <p className="mt-4 text-[16px] leading-7 text-[#667085]">
                  {business.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}