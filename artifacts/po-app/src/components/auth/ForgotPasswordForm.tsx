import { useEffect, useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { SingaporePhoneInput } from "@/components/singapore-phone-input";
import { useToast } from "@/hooks/use-toast";
import { ACCOUNT_PASSWORD_MESSAGE, isValidAccountPassword } from "@/lib/account-password";
import { parseSingaporePhoneDigits, validateSingaporePhoneDigits } from "@/lib/singapore-phone";
import {
  RequiredMark,
  authMobileInputClass,
  authMobileLabelClass,
  authMobilePasswordInputClass,
} from "@/components/auth/AuthMobileShell";

type Channel = "email" | "phone";
type Step = "choose" | "otp" | "password";

type Heading = { title: string; subtitle: string };

const CHOOSE_HEADING: Heading = {
  title: "Forgot Password",
  subtitle: "Choose email or contact number to get a verification code",
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  }
  return data as Record<string, unknown>;
}

export function ForgotPasswordForm({
  onBack,
  onReset,
  onHeading,
}: {
  onBack: () => void;
  onReset: (email?: string) => void;
  onHeading: (heading: Heading) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("choose");
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resetId, setResetId] = useState("");
  const [masked, setMasked] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step === "choose") onHeading(CHOOSE_HEADING);
    else if (step === "otp") {
      onHeading({
        title: "Verify OTP",
        subtitle: masked
          ? `Enter the 6-digit code sent to ${masked}`
          : "Enter the 6-digit code sent to your email",
      });
    } else {
      onHeading({
        title: "Set new password",
        subtitle: "Use 8 characters with a capital letter, a small letter, a number, and a special character",
      });
    }
  }, [step, masked, onHeading]);

  function selectChannel(next: Channel) {
    setChannel(next);
  }

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (!channel) {
      toast({ title: "Choose email or contact number", variant: "destructive" });
      return;
    }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (channel === "phone") {
      const phoneError = validateSingaporePhoneDigits(parseSingaporePhoneDigits(phone));
      if (phoneError) {
        toast({ title: phoneError, variant: "destructive" });
        return;
      }
    }

    try {
      setLoading(true);
      const data = await postJson("/api/auth/forgot-password/request", {
        channel,
        value: channel === "email" ? email.trim().toLowerCase() : parseSingaporePhoneDigits(phone),
      });
      setResetId(String(data.resetId ?? ""));
      setMasked(String(data.masked ?? ""));
      setOtp("");
      setStep("otp");
      toast({ title: "Verification code sent" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not send the code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const data = await postJson("/api/auth/forgot-password/verify", { resetId, otp });
      setResetId(String(data.resetToken ?? ""));
      setPassword("");
      setConfirmPassword("");
      setStep("password");
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Incorrect code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidAccountPassword(password)) {
      toast({ title: ACCOUNT_PASSWORD_MESSAGE, variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Password and confirm password do not match", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      await postJson("/api/auth/forgot-password/reset", {
        resetToken: resetId,
        password,
        confirmPassword,
      });
      onReset(channel === "email" ? email.trim().toLowerCase() : undefined);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not reset the password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const nextButtonClass =
    "flex h-14 w-full cursor-pointer items-center justify-center rounded-[10px] border-0 bg-blue-600 text-[0.95rem] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70";

  const channelButtonClass = (selected: boolean) =>
    `box-border h-11 cursor-pointer rounded-[10px] border-2 text-[0.9rem] font-semibold ${
      selected
        ? "border-blue-600 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-white text-[#101828] hover:border-blue-300"
    }`;

  if (step === "otp") {
    return (
      <form className="flex flex-col gap-5" onSubmit={verifyCode}>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={authMobileLabelClass}>OTP<RequiredMark /></span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Enter 6-digit code"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className={`${authMobileInputClass} text-center tracking-[0.45em]`}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>
        <button type="submit" disabled={loading} className={nextButtonClass} style={{ fontFamily: "Poppins, sans-serif" }}>
          {loading ? "Checking..." : "Verify"}
        </button>
        <p className="mb-0 mt-1 text-center text-[0.9rem] text-gray-600">
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-gray-500 hover:underline" onClick={() => setStep("choose")}>
            Back
          </button>
          <span className="px-2 text-gray-300">|</span>
          <button
            type="button"
            disabled={loading}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-blue-600 hover:underline disabled:opacity-60"
            onClick={() => void requestCode()}
          >
            Resend code
          </button>
        </p>
      </form>
    );
  }

  if (step === "password") {
    return (
      <form className="flex flex-col gap-5" onSubmit={savePassword}>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={authMobileLabelClass}>New password<RequiredMark /></span>
          <div className="relative flex items-center">
            <input
              type={showPassword ? "text" : "password"}
              maxLength={8}
              placeholder="8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value.slice(0, 8))}
              autoComplete="new-password"
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
        <label className="flex min-w-0 flex-col gap-2">
          <span className={authMobileLabelClass}>Confirm password<RequiredMark /></span>
          <div className="relative flex items-center">
            <input
              type={showConfirm ? "text" : "password"}
              maxLength={8}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value.slice(0, 8))}
              autoComplete="new-password"
              className={authMobilePasswordInputClass}
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
        <button type="submit" disabled={loading} className={nextButtonClass} style={{ fontFamily: "Poppins, sans-serif" }}>
          {loading ? "Saving..." : "Reset password"}
        </button>
        <p className="mb-0 mt-1 text-center text-[0.9rem] text-gray-600">
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-blue-600 hover:underline" onClick={onBack}>
            Back to sign in
          </button>
        </p>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={requestCode}>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => selectChannel("email")}
          className={channelButtonClass(channel === "email")}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => selectChannel("phone")}
          className={channelButtonClass(channel === "phone")}
        >
          Contact number
        </button>
      </div>

      {channel === "email" ? (
        <label className="flex min-w-0 flex-col gap-2">
          <span className={authMobileLabelClass}>Email Address<RequiredMark /></span>
          <input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={authMobileInputClass}
            style={{ fontFamily: "Poppins, sans-serif" }}
          />
        </label>
      ) : null}

      {channel === "phone" ? (
        <label className="flex min-w-0 flex-col gap-2">
          <span className={authMobileLabelClass}>Contact number<RequiredMark /></span>
          <SingaporePhoneInput
            value={phone}
            onChange={setPhone}
            className="h-11 rounded-[10px] border-gray-200"
          />
          <span className="text-[0.78rem] leading-snug text-gray-500">
            The code is sent to the email saved on this contact number.
          </span>
        </label>
      ) : null}

      <button type="submit" disabled={loading} className={nextButtonClass} style={{ fontFamily: "Poppins, sans-serif" }}>
        {loading ? "Sending..." : "Next"}
      </button>

      <p className="mb-0 mt-1 text-center text-[0.9rem] text-gray-600">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-blue-600 hover:underline" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </form>
  );
}
