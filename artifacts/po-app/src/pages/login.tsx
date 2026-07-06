import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import logo from "@assets/BizOne_main_1782977343449.png";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
      </svg>
    ),
    title: "Instant PDF Generation",
    desc: "Professional POs, Invoices & Quotations in one click",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Multi-Company Support",
    desc: "Manage multiple entities from a single platform",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l3 3"/>
      </svg>
    ),
    title: "GST-Ready for Singapore",
    desc: "Compliant tax invoicing built right in",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    title: "End-to-End Operations",
    desc: "From purchase orders to delivery — fully tracked",
  },
];

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useLogin();

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
          setLocation("/");
        },
        onError: () => {
          toast({
            title: "Login failed",
            description: "Invalid username or password. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left: Branding panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[55%] px-14 py-12"
        style={{ background: "linear-gradient(145deg, #f0f6ff 0%, #e8f0fe 50%, #f5f8ff 100%)" }}
      >
        {/* Logo */}
        <div>
          <img src={logo} alt="BizOne" className="h-11 object-contain" />
        </div>

        {/* Hero copy */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full tracking-wide uppercase">
            Smart Business Operations
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 leading-tight tracking-tight">
            Run Your Business.<br />
            <span className="text-blue-600">Own Every Document.</span>
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed max-w-sm">
            One platform. Multiple companies.<br />Zero paperwork chaos.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-blue-100/60 shadow-sm"
              >
                <div className="text-blue-600 mb-2">{f.icon}</div>
                <p className="text-sm font-semibold text-slate-800">{f.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} BizOne. All rights reserved.
        </p>
      </div>

      {/* ── Right: Login form ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex justify-center">
            <img src={logo} alt="BizOne" className="h-10 object-contain" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-slate-500 text-sm">Sign in to your account to continue</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-medium">Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your username"
                        className="h-11 rounded-lg border-slate-200 bg-slate-50 focus:bg-white transition-colors"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-medium">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="h-11 rounded-lg border-slate-200 bg-slate-50 focus:bg-white transition-colors pr-10"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 transition-colors"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-xs text-slate-400 pt-4">
            Powered by <span className="font-semibold text-slate-500">BizOne</span>
          </p>
        </div>
      </div>
    </div>
  );
}
