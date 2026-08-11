import { Menu, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import BizOneLogo from "./BizOneLogo";

export default function Navbar() {
  const [mobileMenu, setMobileMenu] = useState(false);

  const navItems = [
    "Home",
    "Features",
    "Pricing",
    "About",
    "Contact",
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <BizOneLogo className="h-12 w-auto" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-10 md:flex">
          {navItems.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className={`text-[14px] font-medium transition ${
                item === "Home"
                  ? "text-[#2563EB]"
                  : "text-[#4B5563] hover:text-[#2563EB]"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Buttons */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-[16px] border border-gray-200 bg-white px-5 py-2 text-[14px] font-medium text-[#111827] transition hover:border-blue-500 hover:text-blue-600"
          >
            Login
          </Link>

          <Link
            href="/register"
            className="group flex items-center justify-center gap-2 rounded-[16px] bg-[#2563EB] px-5 py-2 text-base font-semibold text-white transition duration-300 hover:bg-[#1D4ED8] hover:shadow-xl"
          >
            Start Free Trial
            <ArrowRight
              size={18}
              className="transition group-hover:translate-x-1"
            />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="md:hidden"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenu && (
        <div className="border-t bg-white md:hidden">
          <div className="flex flex-col px-6 py-4">
            {navItems.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={() => setMobileMenu(false)}
                className="py-3 text-[15px] text-gray-700"
              >
                {item}
              </a>
            ))}

            <Link
              href="/login"
              onClick={() => setMobileMenu(false)}
              className="mt-3 rounded-lg border border-gray-200 py-2 text-center font-medium"
            >
              Login
            </Link>

            <Link
              href="/register"
              onClick={() => setMobileMenu(false)}
              className="mt-3 rounded-lg bg-[#2563EB] py-2 text-center font-semibold text-white"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
