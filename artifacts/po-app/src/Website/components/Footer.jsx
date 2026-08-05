import BizOneLogo from "./BizOneLogo";

export default function Footer() {
  return (
    <footer className="border-t border-[#EAECF0] bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-14 lg:grid-cols-[1.8fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <BizOneLogo className="h-10 w-auto" />

            <p className="mt-6 max-w-sm text-[16px] leading-7 text-[#667085]">
              A complete multi-company ERP and Business Management System helping organizations manage daily operations from a single application.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-lg font-semibold text-[#101828]">Product</h3>
            <ul className="mt-6 space-y-4 text-[15px] text-[#667085]">
              <li>
                <a href="#home" className="transition hover:text-[#0072F8]">Home</a>
              </li>
              <li>
                <a href="#features" className="transition hover:text-[#0072F8]">Features</a>
              </li>
              <li>
                <a href="#pricing" className="transition hover:text-[#0072F8]">Pricing</a>
              </li>
              <li>
                <a href="#about" className="transition hover:text-[#0072F8]">Use Case</a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-lg font-semibold text-[#101828]">Company</h3>
            <ul className="mt-6 space-y-4 text-[15px] text-[#667085]">
              <li>
                <a href="#about" className="transition hover:text-[#0072F8]">About Us</a>
              </li>
              <li>
                <a href="#contact" className="transition hover:text-[#0072F8]">Careers</a>
              </li>
              <li>
                <a href="#contact" className="transition hover:text-[#0072F8]">Contact</a>
              </li>
              <li>
                <a href="#contact" className="transition hover:text-[#0072F8]">Privacy Policy</a>
              </li>
              <li>
                <a href="#contact" className="transition hover:text-[#0072F8]">Terms &amp; Conditions</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 flex flex-col items-center justify-between gap-5 border-t border-[#EAECF0] pt-8 md:flex-row">
          <p className="text-[15px] text-[#667085]">
            {"\u00A9"} {new Date().getFullYear()} BizOne. All rights reserved.
          </p>

          <div className="flex gap-8 text-[15px] text-[#667085]">
            <a href="#contact" className="hover:text-[#0072F8]">Privacy</a>
            <a href="#contact" className="hover:text-[#0072F8]">Terms</a>
            <a href="#contact" className="hover:text-[#0072F8]">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
