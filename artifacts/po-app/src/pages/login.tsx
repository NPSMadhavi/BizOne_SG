import { useCallback, useEffect, useRef, useState } from "react";
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
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import logo from "@assets/bizone_logo_optimized.webp";
import Advanced from "@assets/Advanced.png";
import SecureBusiness from "@assets/SecureBusiness.png";
import Multitenant from "@assets/Multitenant.png";
import keyTypeUrl from "@/assets/sounds/key-type.wav";
import signInDoorUrl from "@/assets/sounds/sign-in-door.wav";

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

type DoorPhase = "closed" | "opening" | "walking" | "entering" | "closing" | "done";

function playKeyClick() {
  const audio = new Audio(keyTypeUrl);
  audio.volume = 0.85;
  void audio.play().catch(() => {});
}

function isTypingKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return false;
  if (event.key === "Backspace" || event.key === "Delete") return true;
  return event.key.length === 1;
}

function SignInDoor({ phase, snap = false }: { phase: DoorPhase; snap?: boolean }) {
  const open = phase === "opening" || phase === "walking" || phase === "entering";
  const stepping = phase === "walking" || phase === "entering";
  const inside = phase === "entering" || phase === "closing" || phase === "done";

  return (
    <span
      className={`bizone-door${open ? " is-open" : ""}${stepping ? " is-stepping" : ""}${phase === "walking" ? " is-walking" : ""}${inside ? " is-inside" : ""}${snap ? " is-snap" : ""}`}
      aria-hidden="true"
    >
      <svg className="bizone-stick" viewBox="0 0 20 44">
        <circle cx="10" cy="6.2" r="4.3" fill="#fff" />
        <path d="M10 11.2V23.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <g className="leg leg-back">
          <path d="M10 23.5 6.1 40" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g className="leg leg-front">
          <path d="M10 23.5 13.9 40" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
      <span className="bizone-door-frame">
        <span className="bizone-door-glow" />
        <span className="bizone-door-panel">
          <span className="bizone-door-handle" />
        </span>
      </span>
    </span>
  );
}

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
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [panel, setPanel] = useState<"login" | "forgot">("login");
  const [forgotHeading, setForgotHeading] = useState({
    title: "Forgot Password",
    subtitle: "Choose email or contact number to get a verification code",
  });
  const setForgotHeadingStable = useCallback((heading: { title: string; subtitle: string }) => {
    setForgotHeading(heading);
  }, []);
  const [door, setDoor] = useState<DoorPhase>("closed");
  const [doorSnap, setDoorSnap] = useState(false);
  const [entering, setEntering] = useState(false);
  const holdRedirect = useRef(false);
  const doorDone = useRef<Promise<void> | null>(null);
  const doorTimers = useRef<number[]>([]);
  const doorAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && user && !holdRedirect.current) {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  function stopDoorSound() {
    const audio = doorAudio.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function clearDoorTimers() {
    doorTimers.current.forEach((id) => window.clearTimeout(id));
    doorTimers.current = [];
  }

  function startDoor() {
    clearDoorTimers();
    stopDoorSound();
    setDoor("opening");

    const audio = doorAudio.current ?? new Audio(signInDoorUrl);
    doorAudio.current = audio;
    audio.volume = 1;
    audio.currentTime = 0;
    void audio.play().catch(() => {});

    const later = (ms: number, fn: () => void) => {
      doorTimers.current.push(window.setTimeout(fn, ms));
    };

    doorDone.current = new Promise((resolve) => {
      later(380, () => setDoor("walking"));
      later(1000, () => setDoor("entering"));
      later(1320, () => setDoor("closing"));
      later(1680, () => setDoor("done"));
      later(2350, resolve);
    });
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: { email?: string; password?: string } = {};
    if (!form.email.trim()) nextErrors.email = "Email is required";
    if (!form.password) nextErrors.password = "Password is required";

    if (nextErrors.email || nextErrors.password) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    if (door !== "closed" || loginMutation.isPending) return;
    startDoor();

    loginMutation.mutate(
      {
        data: {
          username: form.email.trim().toLowerCase(),
          password: form.password,
        },
      },
      {
        onSuccess: async (data) => {
          holdRedirect.current = true;
          setEntering(true);
          const sessionId = (data as { sessionId?: string }).sessionId;
          if (sessionId) markBrowserSessionLive(sessionId);
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
          await doorDone.current;
          holdRedirect.current = false;
          setLocation("/");
        },
        onError: (error: Error & { message?: string }) => {
          clearDoorTimers();
          stopDoorSound();
          setDoorSnap(true);
          setDoor("closed");
          doorDone.current = null;
          window.setTimeout(() => setDoorSnap(false), 60);
          if (error.message === "Network Error") {
            toast({
              title: "Server connect avvadam ledu. Backend run avutunda check cheyandi.",
              variant: "destructive",
            });
            return;
          }
          setFieldErrors({});
          toast({ title: "Invalid email or password", variant: "destructive" });
        },
      },
    );
  };

  if ((isLoading || user) && !entering) {
    return null;
  }

  const slide = slides[active];
  const loading = loginMutation.isPending;
  const pageSubtitle = panel === "login" ? SIGN_IN_SUBTITLE : forgotHeading.subtitle;

  const fieldErrorClass = "mb-0 mt-1 text-[0.8rem] font-medium text-red-600";
  const inputErrorRing = "border-red-500 focus:border-red-500 focus:ring-red-200";

  const loginForm = (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} data-allow-autofill="true" autoComplete="on">
      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Email Address<RequiredMark /></span>
        <input
          type="email"
          name="email"
          placeholder="Enter your email address"
          value={form.email}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (isTypingKey(event)) playKeyClick();
          }}
          autoComplete="email"
          data-allow-autofill="true"
          aria-invalid={Boolean(fieldErrors.email)}
          className={`${authMobileInputClass}${fieldErrors.email ? ` ${inputErrorRing}` : ""}`}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
        {fieldErrors.email ? <p className={fieldErrorClass}>{fieldErrors.email}</p> : null}
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
            onKeyDown={(event) => {
              if (isTypingKey(event)) playKeyClick();
            }}
            autoComplete="current-password"
            data-allow-autofill="true"
            aria-invalid={Boolean(fieldErrors.password)}
            className={`${authMobilePasswordInputClass}${fieldErrors.password ? ` ${inputErrorRing}` : ""}`}
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
        {fieldErrors.password ? <p className={fieldErrorClass}>{fieldErrors.password}</p> : null}
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
          onClick={() => setPanel("forgot")}
        >
          Forgot Password
        </button>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading || door !== "closed"}
          className="relative flex h-14 w-full cursor-pointer items-center rounded-[10px] border-0 bg-blue-600 pl-4 pr-2 text-[0.95rem] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-90"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          <span className="flex-1 text-center">Sign in</span>
          <SignInDoor phase={door} snap={doorSnap} />
        </button>
        {door === "done" ? (
          <p className="mb-0 mt-2 text-center text-sm font-medium text-gray-500">Welcome back!</p>
        ) : door !== "closed" ? (
          <p className="mb-0 mt-2 text-center text-sm font-medium text-blue-600">Signing you in...</p>
        ) : null}
      </div>

      <p className="mb-0 mt-1 text-center text-[0.9rem] text-gray-600">
        Don&apos;t Have an account?{" "}
        <Link href="/register" className="font-semibold text-blue-600 no-underline hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );

  const formBody =
    panel === "login" ? (
      loginForm
    ) : (
      <ForgotPasswordForm
        onHeading={setForgotHeadingStable}
        onBack={() => setPanel("login")}
        onReset={(email) => {
          if (email) setForm((prev) => ({ ...prev, email, password: "" }));
          else setForm((prev) => ({ ...prev, password: "" }));
          setPanel("login");
          toast({ title: "Password reset. Sign in with your new 8-digit password." });
        }}
      />
    );

  return (
    <>
      <style>{`
        .bizone-door.is-snap .bizone-stick,
        .bizone-door.is-snap .bizone-door-panel,
        .bizone-door.is-snap .bizone-door-glow {
          transition: none;
        }
        .bizone-door {
          position: absolute;
          right: 12px;
          bottom: 8px;
          display: block;
          width: 58px;
          height: 40px;
          pointer-events: none;
        }
        .bizone-stick {
          position: absolute;
          left: 0;
          bottom: 0;
          z-index: 3;
          width: 16px;
          height: 36px;
          overflow: visible;
          transform: translateX(0);
          opacity: 1;
          transition: transform 0.62s linear, opacity 0.22s linear;
        }
        .bizone-door.is-walking .bizone-stick {
          transform: translateX(12px);
        }
        .bizone-door.is-inside .bizone-stick {
          transform: translateX(30px);
          opacity: 0;
        }
        .bizone-stick .leg {
          transform-box: fill-box;
          transform-origin: 50% 0%;
        }
        .bizone-door.is-stepping .leg-front {
          animation: bizone-thigh-front 0.46s linear infinite;
        }
        .bizone-door.is-stepping .leg-back {
          animation: bizone-thigh-back 0.46s linear infinite;
        }
        @keyframes bizone-thigh-front {
          0% { transform: rotate(26deg); }
          50% { transform: rotate(-34deg); }
          100% { transform: rotate(26deg); }
        }
        @keyframes bizone-thigh-back {
          0% { transform: rotate(-22deg); }
          50% { transform: rotate(30deg); }
          100% { transform: rotate(-22deg); }
        }
        .bizone-door-frame {
          position: absolute;
          right: 0;
          bottom: 0;
          display: block;
          width: 28px;
          height: 38px;
          overflow: hidden;
          border-radius: 8px;
          background: #0b1020;
          perspective: 140px;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.28);
        }
        .bizone-door-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 42% 48%, rgba(255,214,130,0.98) 0%, rgba(190,120,40,0.55) 26%, rgba(20,16,12,0.2) 58%, #070b14 78%);
          opacity: 0;
          transition: opacity 0.32s ease;
        }
        .bizone-door.is-open .bizone-door-glow {
          opacity: 0.95;
        }
        .bizone-door-panel {
          position: absolute;
          inset: 0;
          border-radius: 7px;
          background: linear-gradient(165deg, rgba(255,255,255,0.97) 0%, rgba(219,234,254,0.9) 46%, rgba(147,197,253,0.94) 100%);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.75);
          transform-origin: right center;
          transition: transform 0.38s ease;
          backface-visibility: hidden;
        }
        .bizone-door.is-open .bizone-door-panel {
          transform: rotateY(72deg);
        }
        .bizone-door-handle {
          position: absolute;
          left: 7px;
          top: 50%;
          width: 3px;
          height: 11px;
          margin-top: -5.5px;
          border-radius: 2px;
          background: #fff;
        }
      `}</style>
      <AuthMobileShell
        title={panel === "login" ? "Sign in" : forgotHeading.title}
        subtitle={pageSubtitle}
        footer={
          <AuthSlideDots count={slides.length} active={active} onSelect={setActive} />
        }
      >
        {formBody}
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
            <div className={`flex w-full max-w-[520px] flex-col overflow-y-auto rounded-[22px] bg-white px-10 py-9 shadow-[0_24px_60px_rgba(2,12,40,0.28)] ${panel === "login" ? "h-[620px]" : ""}`}>
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
                {panel === "login" ? "Sign In" : forgotHeading.title}
              </h1>
              <p className="m-0 mb-6 text-[0.9rem] leading-relaxed text-gray-500">
                {pageSubtitle}
              </p>

              {formBody}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
