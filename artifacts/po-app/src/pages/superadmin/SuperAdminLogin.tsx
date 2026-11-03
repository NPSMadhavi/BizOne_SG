import React, { useState } from "react";
import { Shield, Lock, User, AlertCircle, ArrowRight, KeyRound, Eye, EyeOff } from "lucide-react";
import { setTabSessionId } from "@/lib/browser-session";
import { superAdminLogin } from "./api";
import type { SuperAdminUser } from "./types";

interface SuperAdminLoginProps {
  onLoginSuccess: (user: SuperAdminUser) => void;
}

export function SuperAdminLogin({ onLoginSuccess }: SuperAdminLoginProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loginId.trim() || !password) {
      setError("Please enter both username/email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await superAdminLogin(loginId.trim(), password);
      if (res.sessionId) {
        setTabSessionId(res.sessionId);
      }
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err?.message || "Invalid Super Admin credentials. Access denied.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#0d2b6b",
        backgroundImage: "linear-gradient(135deg, #091a3e 0%, #0d2b6b 50%, #15459e 100%)",
      }}
      className="flex flex-col items-center justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md space-y-6">
        {/* Top Header / Logo */}
        <div className="text-center space-y-3">
          <div
            style={{ backgroundColor: "rgba(255, 255, 255, 0.15)", borderColor: "rgba(255, 255, 255, 0.25)" }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border text-white shadow-2xl mb-1 backdrop-blur-sm"
          >
            <Shield className="w-9 h-9 text-white" />
          </div>

          <h1 style={{ color: "#ffffff" }} className="text-3xl font-bold tracking-tight">
            BizOne
          </h1>
        </div>

        {/* Login Form Card */}
        <div
          style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
          className="rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/20"
        >
          <div className="mb-5">
            <h2 style={{ color: "#0f172a" }} className="text-lg font-bold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              Super Admin Authentication
            </h2>
          </div>

          {error && (
            <div
              style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}
              className="mb-4 p-3 rounded-lg border text-xs flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Username */}
            <div className="space-y-1.5">
              <label htmlFor="loginId" style={{ color: "#1e293b" }} className="text-xs font-semibold block">
                Email or Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="loginId"
                  type="text"
                  placeholder="Enter username or email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  disabled={isLoading}
                  style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}
                  className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-300 text-slate-900 text-sm font-medium focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 transition-colors"
                />
              </div>
            </div>

            {/* Password with Eye Toggle */}
            <div className="space-y-1.5">
              <label htmlFor="password" style={{ color: "#1e293b" }} className="text-xs font-semibold block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}
                  className="w-full h-11 pl-9 pr-10 rounded-lg border border-slate-300 text-slate-900 text-sm font-medium focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{ backgroundColor: "#1d61e7" }}
              className="w-full h-11 text-white font-semibold text-sm rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Sign In to Super Admin <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
