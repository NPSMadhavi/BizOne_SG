import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { markBrowserSessionLive } from "@/lib/browser-session";
import {
  AuthMobileShell,
  AuthSlideDots,
  RequiredMark,
  authMobileInputClass,
  authMobileLabelClass,
  authMobilePasswordInputClass,
} from "@/components/auth/AuthMobileShell";
import logo from "@assets/bizone_logo_optimized.webp";
import Advanced from "@assets/Advanced.png";
import SecureBusiness from "@assets/SecureBusiness.png";
import Multitenant from "@assets/Multitenant.png";

const slides = [
  {
    title: "Advanced reporting",
    subtitle: "Real-time analytics and insights for informed decision making",
    image: Advanced,
  },
  {
    title: "Secure Business Management",
    subtitle: "Track and manage enterprise assets with role-based access control",
    image: SecureBusiness,
  },
  {
    title: "Multi - tenant architecture",
    subtitle: "Support multiple organizations with isolated data with customizable features",
    image: Multitenant,
  },
];

const SIGN_IN_SUBTITLE =
  "Welcome back! Sign in to access your account with your registered username or email address";

function useAuthPageFont() {
  useEffect(() => {
    document.documentElement.classList.add("auth-page");
    return () => document.documentElement.classList.remove("auth-page");
  }, []);
}

export default function Login() {
  useAuthPageFont();

  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();

  const [active, setActive] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [isLoading, user, setLocation]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.email.trim() || !form.password) {
      toast({ title: "Please enter email and password", variant: "destructive" });
      return;
    }

    loginMutation.mutate(
      {
        data: {
          username: form.email.trim().toLowerCase(),
          password: form.password,
        },
      },
      {
        onSuccess: async (data) => {
          markBrowserSessionLive();
          queryClient.clear();

          const companyId =
            data.user.selectedCompanyId ??
            data.user.companyId ??
            (data.user.companies?.length === 1 ? data.user.companies[0]?.id : null);

          let userWithCompany = { ...data.user, selectedCompanyId: companyId ?? data.user.selectedCompanyId };

          if (companyId) {
            try {
              await fetch("/api/auth/select-company", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ companyId }),
              });
              userWithCompany = { ...userWithCompany, selectedCompanyId: companyId };
            } catch {
              // Session may already have the company from login response.
            }
          }

          queryClient.setQueryData(getGetMeQueryKey(), userWithCompany);

          if (rememberMe) {
            localStorage.setItem("bizone_remember", "1");
          } else {
            localStorage.removeItem("bizone_remember");
          }
          toast({ title: "Login Successful" });
          setLocation("/dashboard");
        },
        onError: (error: Error & { message?: string }) => {
          const message =
            error.message === "Network Error"
              ? "Server connect avvadam ledu. Backend run avutunda check cheyandi."
              : "Invalid email or password";
          toast({ title: message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading || user) {
    return null;
  }

  const slide = slides[active];
  const loading = loginMutation.isPending;

  const loginForm = (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Email Address<RequiredMark /></span>
        <input
          type="email"
          name="email"
          placeholder="Enter your email address"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          className={authMobileInputClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Password<RequiredMark /></span>
        <div className="relative flex items-center">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Type your password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
            className={authMobilePasswordInputClass}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
          <button
            type="button"
            className="absolute right-3 cursor-pointer border-0 bg-transparent p-1 text-[1.1rem] text-gray-400 hover:text-gray-500"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
      </label>

      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[0.88rem] text-[#101828]">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-[15px] w-[15px] accent-blue-600"
          />
          <span>Remember me</span>
        </label>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-[0.88rem] font-semibold text-blue-600 hover:underline"
        >
          Forgot Password
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="h-11 w-full cursor-pointer rounded-[10px] border-0 bg-blue-600 text-[0.95rem] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        style={{ fontFamily: "Poppins, sans-serif" }}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <p className="mb-0 mt-1 text-center text-[0.9rem] text-gray-600">
        Don&apos;t Have an account?{" "}
        <Link href="/register" className="font-semibold text-blue-600 no-underline hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );

  return (
    <>
      <AuthMobileShell
        title="Sign in"
        subtitle={SIGN_IN_SUBTITLE}
        footer={
          <AuthSlideDots count={slides.length} active={active} onSelect={setActive} />
        }
      >
        {loginForm}
      </AuthMobileShell>

      <div
        className="auth-page hidden h-screen min-[901px]:flex items-center justify-center overflow-hidden px-[100px] py-4 max-[1100px]:px-10"
        style={{
          background: "linear-gradient(120deg, #071536 0%, #0d2f7a 42%, #1d4ed8 100%)",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        <div className="grid h-full w-full max-w-[1240px] grid-cols-2 items-center">
          <aside className="flex items-center justify-start py-4 pl-0 pr-4">
            <div className="w-full max-w-[560px] text-left text-white">
              <div className="w-[min(460px,100%)]">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="mb-5 h-auto w-full animate-[floatY_4.5s_ease-in-out_infinite] object-contain"
                />
                <h2 className="m-0 mb-3 text-center text-[clamp(1.45rem,2.1vw,1.9rem)] leading-none tracking-tight whitespace-nowrap">
                  {slide.title}
                </h2>
                <p className="m-0 text-center text-[1.05rem] leading-relaxed text-white/80">
                  {slide.subtitle}
                </p>
                <div className="mt-6 flex w-full items-center justify-center gap-2.5">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Slide ${index + 1}`}
                      onClick={() => setActive(index)}
                      className={`h-2.5 w-2.5 cursor-pointer rounded-full border-0 p-0 transition ${
                        index === active ? "scale-110 bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <section className="flex items-center justify-center p-4">
            <div className="flex h-[620px] w-full max-w-[520px] flex-col rounded-[22px] bg-white px-10 py-9 shadow-[0_24px_60px_rgba(2,12,40,0.28)]">
              <div className="mb-6">
                <Link href="/">
                  <img
                    src={logo}
                    alt="BizOne"
                    className="block h-12 w-auto cursor-pointer object-contain"
                  />
                </Link>
              </div>

              <h1 className="text-Poppins m-0 mb-2 text-[1.85rem] tracking-tight text-[#101828]">
                Sign In
              </h1>
              <p className="m-0 mb-6 text-[0.9rem] leading-relaxed text-gray-500">
                {SIGN_IN_SUBTITLE}
              </p>

              {loginForm}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
