import { Link } from "wouter";
import logo from "@assets/bizone_logo_optimized.webp";

export const AUTH_MOBILE_BLUE = "#1D61E7";

export const authMobileInputClass =
  "w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] px-3 text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

export const authMobilePasswordInputClass =
  "w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] pl-3 pr-[42px] text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

export const authMobileLabelClass = "text-[0.9rem] font-semibold text-[#101828]";

interface AuthMobileShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthMobileShell({ title, subtitle, children, footer }: AuthMobileShellProps) {
  return (
    <div
      className="flex min-h-screen flex-col bg-white min-[901px]:hidden"
      style={{ fontFamily: "Poppins, sans-serif" }}
    >
      <div
        className="px-5 pb-[4.5rem] pt-10 text-center text-white"
        style={{ backgroundColor: AUTH_MOBILE_BLUE }}
      >
        <h1 className="m-0 text-[1.75rem] font-bold tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-[340px] text-[0.88rem] leading-relaxed text-white/90">
          {subtitle}
        </p>
      </div>

      <div className="relative z-10 -mt-10 flex flex-1 flex-col px-4 pb-10">
        <div className="mx-auto w-full max-w-[420px] rounded-[20px] border border-gray-100 bg-white px-6 py-7 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          <div className="mb-6 flex justify-center">
            <Link href="/">
              <img src={logo} alt="BizOne" className="h-11 w-auto cursor-pointer object-contain" />
            </Link>
          </div>
          {children}
        </div>
        {footer ? <div className="mt-8">{footer}</div> : null}
      </div>
    </div>
  );
}

function AuthIndicatorPill({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`block rounded-full transition-all duration-300 ${
        active
          ? "h-2.5 w-10 bg-[#1D61E7]"
          : "h-2 w-5 bg-[#CBD5E1]"
      }`}
    />
  );
}

export function AuthProgressDots({
  total,
  active,
}: {
  total: number;
  active: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {Array.from({ length: total }).map((_, index) => (
        <AuthIndicatorPill key={index} active={index === active} />
      ))}
    </div>
  );
}

export function AuthSlideDots({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Slide ${index + 1}`}
          onClick={() => onSelect?.(index)}
          className="border-0 bg-transparent p-0"
        >
          <AuthIndicatorPill active={index === active} />
        </button>
      ))}
    </div>
  );
}
