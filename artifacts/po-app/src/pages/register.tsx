import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { clearBrowserSessionLive } from "@/lib/browser-session";
import {
  AuthMobileShell,
  AuthProgressDots,
  RequiredMark,
  authMobileLabelClass,
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

const desktopInputClassName =
  "w-full h-10 border border-gray-200 rounded-[10px] bg-white px-3 text-[0.85rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

const desktopPasswordInputClassName =
  "w-full h-10 border border-gray-200 rounded-[10px] bg-white pl-3 pr-[42px] text-[0.85rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

const registerMobileInputClass =
  "w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] px-3 text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

const registerMobilePasswordInputClass =
  "w-full h-11 border border-gray-200 rounded-[10px] bg-[#f8fafc] pl-3 pr-[42px] text-[0.9rem] text-[#101828] outline-none focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] placeholder:text-gray-400";

const registerMobileTextareaClass =
  "w-full min-h-[88px] resize-none rounded-[10px] border border-gray-200 bg-[#f8fafc] px-3 py-2.5 text-[0.9rem] text-[#101828] outline-none placeholder:text-gray-400 focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]";

const registerDesktopTextareaClass =
  "w-full min-h-[72px] resize-none rounded-[10px] border border-gray-200 bg-white px-3 py-2.5 text-[0.85rem] text-[#101828] outline-none placeholder:text-gray-400 focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]";

function useAuthPageFont() {
  useEffect(() => {
    document.documentElement.classList.add("auth-page");
    return () => document.documentElement.classList.remove("auth-page");
  }, []);
}

type RegisterStep = 1 | 2;

interface PersonalForm {
  full_name: string;
  email: string;
  phone_number: string;
  password: string;
  confirm_password: string;
}

interface CompanyForm {
  company_name: string;
  gst_registration_no: string;
  company_email: string;
  company_address: string;
  company_domain: string;
}

function validatePersonalDetails(form: PersonalForm): string | null {
  if (!form.full_name.trim()) return "Full name is required";
  if (!form.email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address";
  if (!form.phone_number.trim()) return "Phone number is required";
  if (form.phone_number.trim().length < 10) return "Phone number must be at least 10 digits";
  if (!form.password) return "Password is required";
  if (form.password.length < 6) return "Password must be at least 6 characters";
  if (form.password !== form.confirm_password) return "Passwords do not match";
  return null;
}

function validateCompanyDetails(form: CompanyForm): string | null {
  if (!form.company_name.trim()) return "Company name is required";
  if (!form.company_email.trim()) return "Company email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.company_email.trim())) {
    return "Enter a valid company email address";
  }
  if (!form.company_address.trim()) return "Company address is required";
  if (form.company_address.trim().length < 5) return "Company address is too short";
  if (!form.company_domain.trim()) return "Company domain is required";
  if (form.company_domain.trim().length < 3) return "Company domain is too short";
  return null;
}

export default function Register() {
  useAuthPageFont();

  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<RegisterStep>(1);
  const [active, setActive] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [personalForm, setPersonalForm] = useState<PersonalForm>({
    full_name: "",
    email: "",
    phone_number: "",
    password: "",
    confirm_password: "",
  });
  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    company_name: "",
    gst_registration_no: "",
    company_email: "",
    company_address: "",
    company_domain: "",
  });

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

  const handlePersonalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPersonalForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCompanyForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validatePersonalDetails(personalForm);
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const personalError = validatePersonalDetails(personalForm);
    if (personalError) {
      toast({ title: personalError, variant: "destructive" });
      setStep(1);
      return;
    }

    const companyError = validateCompanyDetails(companyForm);
    if (companyError) {
      toast({ title: companyError, variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: personalForm.full_name.trim(),
          email: personalForm.email.trim().toLowerCase(),
          phoneNumber: personalForm.phone_number.trim(),
          password: personalForm.password,
          companyName: companyForm.company_name.trim(),
          companyEmail: companyForm.company_email.trim().toLowerCase(),
          companyAddress: companyForm.company_address.trim(),
          companyDomain: companyForm.company_domain.trim().toLowerCase(),
          gstRegistrationNo: companyForm.gst_registration_no.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: data.error ?? "Registration failed",
          variant: "destructive",
        });
        return;
      }

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      clearBrowserSessionLive();
      queryClient.clear();

      toast({ title: data.message ?? "Registration Successful" });
      setLocation("/login");
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Network Error"
          ? "Server connect avvadam ledu. Backend run avutunda check cheyandi."
          : "Registration failed";
      toast({ title: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || user) {
    return null;
  }

  const slide = slides[active];
  const mobileTitle = step === 1 ? "Sign up" : "Company Details";
  const mobileSubtitle =
    step === 1
      ? "Create your BizOne account to start managing enterprise assets"
      : "Tell us about your company to complete registration";
  const progressActive = step === 1 ? 2 : 0;

  const signUpLink = (
    <p className="mb-0 mt-4 text-center text-[0.9rem] text-gray-600">
      Already Have an account?{" "}
      <Link href="/login" className="font-semibold text-blue-600 no-underline hover:underline">
        Sign in
      </Link>
    </p>
  );

  const personalFormMobile = (
    <form className="flex flex-col gap-4" onSubmit={handleNext}>
      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Email<RequiredMark /></span>
        <input
          type="email"
          name="email"
          placeholder="Enter company email"
          value={personalForm.email}
          onChange={handlePersonalChange}
          autoComplete="email"
          className={registerMobileInputClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Full Name<RequiredMark /></span>
        <input
          type="text"
          name="full_name"
          placeholder="Enter your full name"
          value={personalForm.full_name}
          onChange={handlePersonalChange}
          autoComplete="name"
          className={registerMobileInputClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Phone Number<RequiredMark /></span>
        <input
          type="tel"
          name="phone_number"
          placeholder="Enter phone number"
          value={personalForm.phone_number}
          onChange={handlePersonalChange}
          autoComplete="tel"
          className={registerMobileInputClass}
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
            value={personalForm.password}
            onChange={handlePersonalChange}
            autoComplete="new-password"
            className={registerMobilePasswordInputClass}
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

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Confirm Password<RequiredMark /></span>
        <div className="relative flex items-center">
          <input
            type={showConfirm ? "text" : "password"}
            name="confirm_password"
            placeholder="Confirm your password"
            value={personalForm.confirm_password}
            onChange={handlePersonalChange}
            autoComplete="new-password"
            className={registerMobilePasswordInputClass}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
          <button
            type="button"
            className="absolute right-3 cursor-pointer border-0 bg-transparent p-1 text-[1.1rem] text-gray-400 hover:text-gray-500"
            onClick={() => setShowConfirm((prev) => !prev)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
      </label>

      <div className="mt-2 flex gap-3">
        <Link
          href="/login"
          className="flex h-11 flex-1 items-center justify-center rounded-[10px] border border-gray-200 bg-white text-[0.95rem] text-[#101828] no-underline hover:bg-gray-50"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          Back
        </Link>
        <button
          type="submit"
          className="h-11 flex-[1.4] cursor-pointer rounded-[10px] border-0 bg-blue-600 text-[0.95rem] font-semibold text-white hover:bg-blue-700"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          Sign up
        </button>
      </div>
      {signUpLink}
    </form>
  );

  const companyFormMobile = (
    <form className="flex flex-col gap-4" onSubmit={handleSignUp}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-2">
          <span className={`${authMobileLabelClass} text-[0.82rem]`}>Name<RequiredMark /></span>
          <input
            type="text"
            name="company_name"
            placeholder="Enter company name"
            value={companyForm.company_name}
            onChange={handleCompanyChange}
            className={`${registerMobileInputClass} h-10 text-[0.85rem]`}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-2">
          <span className={`${authMobileLabelClass} text-[0.82rem]`}>Domain<RequiredMark /></span>
          <input
            type="text"
            name="company_domain"
            placeholder="Example.com"
            value={companyForm.company_domain}
            onChange={handleCompanyChange}
            className={`${registerMobileInputClass} h-10 text-[0.85rem]`}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Email<RequiredMark /></span>
        <input
          type="email"
          name="company_email"
          placeholder="Enter company email"
          value={companyForm.company_email}
          onChange={handleCompanyChange}
          className={registerMobileInputClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>GST Registration (Optional)</span>
        <input
          type="text"
          name="gst_registration_no"
          placeholder="Enter GST registration number"
          value={companyForm.gst_registration_no}
          onChange={handleCompanyChange}
          className={registerMobileInputClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className={authMobileLabelClass}>Address<RequiredMark /></span>
        <textarea
          name="company_address"
          placeholder="Enter company address"
          value={companyForm.company_address}
          onChange={handleCompanyChange}
          rows={3}
          className={registerMobileTextareaClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={loading}
          className="h-11 flex-1 cursor-pointer rounded-[10px] border border-gray-200 bg-white text-[0.95rem] text-[#101828] hover:bg-gray-50 disabled:opacity-70"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-11 flex-[1.4] cursor-pointer rounded-[10px] border-0 bg-blue-600 text-[0.95rem] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </div>
      {signUpLink}
    </form>
  );

  const personalFormDesktop = (
    <form className="flex min-h-0 flex-1 flex-col gap-3.5" onSubmit={handleNext}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[0.82rem] font-semibold text-[#101828]">Email<RequiredMark /></span>
        <input
          type="email"
          name="email"
          placeholder="Enter your email address"
          value={personalForm.email}
          onChange={handlePersonalChange}
          autoComplete="email"
          className={desktopInputClassName}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Full Name<RequiredMark /></span>
          <input
            type="text"
            name="full_name"
            placeholder="Enter your full name"
            value={personalForm.full_name}
            onChange={handlePersonalChange}
            autoComplete="name"
            className={desktopInputClassName}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Phone Number<RequiredMark /></span>
          <input
            type="tel"
            name="phone_number"
            placeholder="Enter your phone number"
            value={personalForm.phone_number}
            onChange={handlePersonalChange}
            autoComplete="tel"
            className={desktopInputClassName}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Password<RequiredMark /></span>
          <div className="relative flex items-center">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Type your password"
              value={personalForm.password}
              onChange={handlePersonalChange}
              autoComplete="new-password"
              className={desktopPasswordInputClassName}
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

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Confirm Password<RequiredMark /></span>
          <div className="relative flex items-center">
            <input
              type={showConfirm ? "text" : "password"}
              name="confirm_password"
              placeholder="Confirm your password"
              value={personalForm.confirm_password}
              onChange={handlePersonalChange}
              autoComplete="new-password"
              className={desktopPasswordInputClassName}
              style={{ fontFamily: "Poppins, sans-serif" }}
            />
            <button
              type="button"
              className="absolute right-3 cursor-pointer border-0 bg-transparent p-1 text-[1.1rem] text-gray-400 hover:text-gray-500"
              onClick={() => setShowConfirm((prev) => !prev)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </label>
      </div>

      <button
        type="submit"
        className="mt-6 h-10 w-full cursor-pointer rounded-[10px] border-0 bg-blue-600 text-[0.95rem] text-white hover:bg-blue-700"
        style={{ fontFamily: "Poppins, sans-serif" }}
      >
        Next
      </button>
    </form>
  );

  const companyFormDesktop = (
    <form className="flex min-h-0 flex-1 flex-col gap-3.5" onSubmit={handleSignUp}>
      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Name<RequiredMark /></span>
          <input
            type="text"
            name="company_name"
            placeholder="Enter company name"
            value={companyForm.company_name}
            onChange={handleCompanyChange}
            className={desktopInputClassName}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.82rem] font-semibold text-[#101828]">Domain<RequiredMark /></span>
          <input
            type="text"
            name="company_domain"
            placeholder="example.com"
            value={companyForm.company_domain}
            onChange={handleCompanyChange}
            className={desktopInputClassName}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[0.82rem] font-semibold text-[#101828]">Email<RequiredMark /></span>
        <input
          type="email"
          name="company_email"
          placeholder="Enter company email"
          value={companyForm.company_email}
          onChange={handleCompanyChange}
          className={desktopInputClassName}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[0.82rem] font-semibold text-[#101828]">GST Registration</span>
        <input
          type="text"
          name="gst_registration_no"
          placeholder="Enter GST registration number (optional)"
          value={companyForm.gst_registration_no}
          onChange={handleCompanyChange}
          className={desktopInputClassName}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[0.82rem] font-semibold text-[#101828]">Address<RequiredMark /></span>
        <textarea
          name="company_address"
          placeholder="Enter company address"
          value={companyForm.company_address}
          onChange={handleCompanyChange}
          rows={2}
          className={registerDesktopTextareaClass}
          style={{ fontFamily: "Poppins, sans-serif" }}
        />
      </label>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={loading}
          className="h-10 flex-1 cursor-pointer rounded-[10px] border border-gray-200 bg-white text-[0.95rem] text-[#101828] hover:bg-gray-50 disabled:opacity-70"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-10 flex-[1.4] cursor-pointer rounded-[10px] border-0 bg-blue-600 text-[0.95rem] text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </div>
    </form>
  );

  return (
    <>
      <AuthMobileShell
        title={mobileTitle}
        subtitle={mobileSubtitle}
        footer={<AuthProgressDots total={3} active={progressActive} />}
      >
        {step === 1 ? personalFormMobile : companyFormMobile}
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
            <div className="flex min-h-[580px] w-full max-w-[520px] flex-col rounded-[22px] bg-white px-10 py-8 shadow-[0_24px_60px_rgba(2,12,40,0.28)]">
              <div className="mb-5">
                <img src={logo} alt="BizOne" className="block h-12 w-auto object-contain" />
              </div>

              <h1 className="m-0 mb-2 text-[1.85rem] tracking-tight text-[#101828]">
                {step === 1 ? "Sign Up" : "Company Details"}
              </h1>
              <p className="m-0 mb-5 text-[0.9rem] leading-relaxed text-gray-500">
                {mobileSubtitle}
              </p>

              {step === 1 ? personalFormDesktop : companyFormDesktop}

              <p className="mb-0 mt-auto shrink-0 pt-[22px] text-center text-[0.9rem] text-gray-600">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-blue-600 no-underline hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
