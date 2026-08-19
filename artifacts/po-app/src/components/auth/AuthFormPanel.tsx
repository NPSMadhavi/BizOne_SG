import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
} from "lucide-react";
import logo from "@assets/bizone_logo_optimized.webp";
import { RequiredMark } from "@/components/auth/AuthMobileShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SignInFormValues {
  email: string;
  password: string;
}

export interface SignUpFormValues {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

type AuthMode = "signin" | "signup";

interface AuthFormPanelProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  signInForm: UseFormReturn<SignInFormValues>;
  signUpForm: UseFormReturn<SignUpFormValues>;
  onSignIn: (data: SignInFormValues) => void;
  onSignUp: (data: SignUpFormValues) => void;
  isSigningIn: boolean;
  isSigningUp: boolean;
}

const inputClassName =
  "h-12 rounded-xl border-0 bg-[#E8F0FE] pl-10 text-[#111827] shadow-none placeholder:text-[#9CA3AF] focus-visible:bg-[#EEF4FF] focus-visible:ring-2 focus-visible:ring-[#2563EB]/25";

export function AuthFormPanel({
  mode,
  onModeChange,
  signInForm,
  signUpForm,
  onSignIn,
  onSignUp,
  isSigningIn,
  isSigningUp,
}: AuthFormPanelProps) {
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-[#0B4DB8] px-4 py-10 sm:px-6 lg:min-h-0 lg:px-10">
      <div className="w-full max-w-[520px] rounded-[28px] bg-white px-8 py-10 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-10 sm:py-12">
        <div className="mb-8">
          <img src={logo} alt="BizOne" className="h-11 w-auto object-contain" />
        </div>

        <div className="mb-8">
          <h1 className="text-[2rem] font-bold leading-tight text-[#111827]">
            {mode === "signin" ? "Sign In" : "Sign Up"}
          </h1>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-[#6B7280]">
            {mode === "signin"
              ? "Welcome back! Sign in to access your account with your registered username or email address"
              : "Create your account to access the BizOne platform with your email and phone number."}
          </p>
        </div>

        {mode === "signin" ? (
          <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="signin-email" className="text-sm font-semibold text-[#111827]">
                Email Address<RequiredMark />
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signin-email"
                  {...signInForm.register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email address"
                  className={inputClassName}
                />
              </div>
              {signInForm.formState.errors.email && (
                <p className="text-sm text-red-500">{signInForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signin-password" className="text-sm font-semibold text-[#111827]">
                Password<RequiredMark />
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signin-password"
                  {...signInForm.register("password")}
                  type={showSignInPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Type your password"
                  className={`${inputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowSignInPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                  aria-label={showSignInPassword ? "Hide password" : "Show password"}
                >
                  {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {signInForm.formState.errors.password && (
                <p className="text-sm text-red-500">{signInForm.formState.errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  className="border-[#D1D5DB] data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
                />
                <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal text-[#4B5563]">
                  Remember me
                </Label>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
              >
                Forgot password
              </button>
            </div>

            <Button
              type="submit"
              disabled={isSigningIn}
              className="h-12 w-full rounded-xl bg-[#2563EB] text-base font-semibold text-white shadow-none transition-all duration-200 hover:bg-[#1D4ED8]"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>

            <p className="pt-2 text-center text-sm text-[#6B7280]">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => onModeChange("signup")}
                className="font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
              >
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-full-name" className="text-sm font-semibold text-[#111827]">
                Full Name<RequiredMark />
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signup-full-name"
                  {...signUpForm.register("fullName")}
                  autoComplete="name"
                  placeholder="Enter your full name"
                  className={inputClassName}
                />
              </div>
              {signUpForm.formState.errors.fullName && (
                <p className="text-sm text-red-500">{signUpForm.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-email" className="text-sm font-semibold text-[#111827]">
                Email Address<RequiredMark />
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signup-email"
                  {...signUpForm.register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email address"
                  className={inputClassName}
                />
              </div>
              {signUpForm.formState.errors.email && (
                <p className="text-sm text-red-500">{signUpForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-phone" className="text-sm font-semibold text-[#111827]">
                Phone Number<RequiredMark />
              </Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signup-phone"
                  {...signUpForm.register("phoneNumber")}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Enter your phone number"
                  className={inputClassName}
                />
              </div>
              {signUpForm.formState.errors.phoneNumber && (
                <p className="text-sm text-red-500">{signUpForm.formState.errors.phoneNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-password" className="text-sm font-semibold text-[#111827]">
                Password<RequiredMark />
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signup-password"
                  {...signUpForm.register("password")}
                  type={showSignUpPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  className={`${inputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowSignUpPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                  aria-label={showSignUpPassword ? "Hide password" : "Show password"}
                >
                  {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {signUpForm.formState.errors.password && (
                <p className="text-sm text-red-500">{signUpForm.formState.errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-confirm-password" className="text-sm font-semibold text-[#111827]">
                Confirm Password<RequiredMark />
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="signup-confirm-password"
                  {...signUpForm.register("confirmPassword")}
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  className={`${inputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {signUpForm.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500">{signUpForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSigningUp}
              className="h-12 w-full rounded-xl bg-[#2563EB] text-base font-semibold text-white shadow-none transition-all duration-200 hover:bg-[#1D4ED8]"
            >
              {isSigningUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Sign up"
              )}
            </Button>

            <p className="pt-2 text-center text-sm text-[#6B7280]">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onModeChange("signin")}
                className="font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
