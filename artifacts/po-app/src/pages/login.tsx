import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { FiUser, FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { markBrowserSessionLive } from "@/lib/browser-session";
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
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
          const companyId =
            data.user.selectedCompanyId ??
            (data.user.companies?.length === 1 ? data.user.companies[0]?.id : null);

          if (companyId) {
            try {
              await fetch("/api/auth/select-company", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ companyId }),
              });
              queryClient.setQueryData(getGetMeQueryKey(), {
                ...data.user,
                selectedCompanyId: companyId,
              });
            } catch {
              // Session may already have the company from login response.
            }
          }

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

  return (
    <div
      className="auth-page h-screen overflow-hidden flex items-center justify-center px-[100px] py-4 max-[1100px]:px-10 max-[900px]:px-5 max-[480px]:px-3 max-[900px]:h-auto max-[900px]:min-h-screen max-[900px]:overflow-auto"
      style={{
        background: "linear-gradient(120deg, #071536 0%, #0d2f7a 42%, #1d4ed8 100%)",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div className="w-full max-w-[1240px] h-full grid grid-cols-2 items-center max-[900px]:grid-cols-1 max-[900px]:h-auto">
        <aside className="flex items-center justify-start pl-0 pr-4 py-4 max-[900px]:p-5 max-[480px]:hidden">
          <div className="w-full max-w-[560px] text-left text-white">
            <div className="w-[min(460px,100%)]">
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-auto mb-5 object-contain animate-[floatY_4.5s_ease-in-out_infinite]"
              />
              <h2 className="m-0 mb-3 text-[clamp(1.45rem,2.1vw,1.9rem)] text-center tracking-tight leading-none whitespace-nowrap">
                {slide.title}
              </h2>
              <p className="m-0 text-[1.05rem] leading-relaxed text-white/80 text-center">
                {slide.subtitle}
              </p>
              <div className="w-full flex justify-center items-center gap-2.5 mt-6">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Slide ${index + 1}`}
                    onClick={() => setActive(index)}
                    className={`w-2.5 h-2.5 rounded-full border-0 p-0 cursor-pointer transition ${
                      index === active ? "bg-white scale-110" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="flex items-center justify-center p-4 max-[900px]:p-5">
          <div className="w-full max-w-[520px] h-[620px] flex flex-col bg-white rounded-[22px] px-10 py-9 shadow-[0_24px_60px_rgba(2,12,40,0.28)] max-[900px]:px-[22px] max-[900px]:py-7 max-[900px]:h-auto">
            <div className="mb-6">
              <Link href="/">
                <img src={logo} alt="BizOne" className="h-12 w-auto object-contain block cursor-pointer" />
              </Link>
            </div>

            <h1 className="m-0 mb-2 text-[1.85rem] text-Poppins tracking-tight text-[#101828]">
              Sign In
            </h1>
            <p className="m-0 mb-6 text-[0.9rem] leading-relaxed text-gray-500">
              Welcome back! Sign in to access your account with your registered
              username or email address
            </p>

            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 min-w-0">
                <span className="text-[0.9rem] font-semibold text-[#101828]">
                  Email Address
                </span>
                <div className="relative flex items-center">
                  <FiUser className="absolute left-3.5 text-gray-400 text-[1.05rem] pointer-events-none" />
                  <input
                    type="email"
                    name="email"
                    placeholder="Enter your email address"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                    className="w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] pl-[42px] pr-[42px] text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400"
                    style={{ fontFamily: "Poppins, sans-serif" }}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-2 min-w-0">
                <span className="text-[0.9rem] font-semibold text-[#101828]">
                  Password
                </span>
                <div className="relative flex items-center">
                  <FiLock className="absolute left-3.5 text-gray-400 text-[1.05rem] pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Type your password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    className="w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] pl-[42px] pr-[42px] text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400"
                    style={{ fontFamily: "Poppins, sans-serif" }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 border-0 bg-transparent text-gray-400 p-1 cursor-pointer text-[1.1rem] hover:text-gray-500"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-[0.88rem] text-[#101828] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-[15px] h-[15px] accent-blue-600"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="border-0 bg-transparent text-blue-600 text-[0.88rem] font-semibold cursor-pointer p-0 hover:underline"
                >
                  Forgot password
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 border-0 rounded-[10px] bg-blue-600 text-white text-[0.95rem] font-normal cursor-pointer hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ fontFamily: "Poppins, sans-serif" }}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-6 mb-0 text-center text-[0.9rem] text-gray-600">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-blue-600 font-semibold no-underline hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
