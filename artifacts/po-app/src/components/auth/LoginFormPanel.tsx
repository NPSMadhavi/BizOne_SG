import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import bizoneLogoSrc from "@/assets/bizone-logo.png";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LoginFormValues {
  username: string;
  password: string;
}

interface LoginFormPanelProps {
  loginForm: UseFormReturn<LoginFormValues>;
  onLogin: (data: LoginFormValues) => void;
  isSubmitting: boolean;
}

export function LoginFormPanel({
  loginForm,
  onLogin,
  isSubmitting,
}: LoginFormPanelProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-white px-6 py-10 sm:px-10 lg:min-h-0 lg:px-16 xl:px-20">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 flex justify-center lg:justify-start">
          <img
            src={bizoneLogoSrc}
            alt="BizOne"
            className="h-12 w-auto object-contain"
            draggable={false}
          />
        </div>

        <div className="mb-8">
          <h1 className="text-[1.75rem] font-bold leading-tight text-[#111827] sm:text-3xl">
            Administrator Access
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7280] sm:text-[0.95rem]">
            Welcome back! Sign in to access your account with your registered username
          </p>
        </div>

        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="login-username" className="text-sm font-medium text-[#374151]">
              Username
            </Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                id="login-username"
                {...loginForm.register("username")}
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                className="h-11 rounded-lg border-[#E5E7EB] bg-white pl-10 text-[#111827] placeholder:text-[#9CA3AF] focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/20"
              />
            </div>
            {loginForm.formState.errors.username && (
              <p className="text-sm text-red-500">{loginForm.formState.errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password" className="text-sm font-medium text-[#374151]">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                id="login-password"
                {...loginForm.register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Type your password"
                className="h-11 rounded-lg border-[#E5E7EB] bg-white pl-10 pr-10 text-[#111827] placeholder:text-[#9CA3AF] focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {loginForm.formState.errors.password && (
              <p className="text-sm text-red-500">{loginForm.formState.errors.password.message}</p>
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
            disabled={isSubmitting}
            className="h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1D4ED8] hover:shadow-md"
            data-testid="button-login"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Access Platform"
            )}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm font-medium text-[#2563EB] lg:text-left">
          System Online
        </p>
      </div>
    </div>
  );
}
