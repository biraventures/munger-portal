"use client";

import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAttendanceLang, type AttendanceLang } from "@/lib/attendance-i18n";

export interface AttendanceLoginValues {
  username: string;
  password: string;
  rememberMe: boolean;
}

type Lang = AttendanceLang;

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    title: "Asset Management Login",
    subtitle: "Field staff attendance, fleet, street lights, submersible pyau, and related roles.",
    username: "Username",
    usernamePlaceholder: "Enter your username",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot your password? Contact your Attendance Admin to have it reset.",
    logIn: "Log In",
    loggingIn: "Logging in...",
    missingFields: "Enter your username and password.",
    genericError: "We couldn't log you in. Check your username and password, then try again.",
  },
  hi: {
    title: "एसेट प्रबंधन लॉगिन",
    subtitle: "फील्ड स्टाफ हाज़िरी, फ्लीट, स्ट्रीट लाइट, सबमर्सिबल प्याऊ और संबंधित भूमिकाओं के लिए।",
    username: "यूज़रनेम",
    usernamePlaceholder: "अपना यूज़रनेम डालें",
    password: "पासवर्ड",
    passwordPlaceholder: "अपना पासवर्ड डालें",
    showPassword: "पासवर्ड दिखाएँ",
    hidePassword: "पासवर्ड छिपाएँ",
    rememberMe: "मुझे याद रखें",
    forgotPassword: "पासवर्ड भूल गए? इसे रीसेट कराने के लिए अपने अटेंडेंस एडमिन से संपर्क करें।",
    logIn: "लॉग इन करें",
    loggingIn: "लॉग इन हो रहा है...",
    missingFields: "अपना यूज़रनेम और पासवर्ड डालें।",
    genericError: "लॉग इन नहीं हो सका। अपना यूज़रनेम और पासवर्ड जाँचकर दोबारा कोशिश करें।",
  },
};

export function AttendanceLoginForm({
  onSubmit,
}: {
  onSubmit: (values: AttendanceLoginValues) => Promise<void>;
}) {
  const usernameId = useId();
  const passwordId = useId();
  const rememberMeId = useId();

  // Shared with every /attendance/* page via AttendanceLangProvider -
  // the choice made here is what every screen after login shows too.
  const { lang, setLang } = useAttendanceLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = STRINGS[lang];

  function changeLang(next: Lang) {
    setLang(next);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError(t.missingFields);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ username: username.trim(), password, rememberMe });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8"
    >
      <div className="mb-5 flex items-center justify-end gap-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => changeLang("en")}
          aria-pressed={lang === "en"}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            lang === "en" ? "bg-nnm-blue text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => changeLang("hi")}
          aria-pressed={lang === "hi"}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            lang === "hi" ? "bg-nnm-blue text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          हिंदी
        </button>
      </div>

      <h1 className="mb-1 text-xl font-semibold text-slate-900">{t.title}</h1>
      <p className="mb-6 text-sm text-slate-500">{t.subtitle}</p>

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor={usernameId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {t.username}
        </label>
        <input
          id={usernameId}
          type="text"
          autoComplete="username"
          placeholder={t.usernamePlaceholder}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
        />
      </div>

      <div className="mb-4">
        <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {t.password}
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-nnm-blue focus-within:ring-offset-1">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.hidePassword : t.showPassword}
            className="flex items-center px-3 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <label htmlFor={rememberMeId} className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 select-none">
          <input
            id={rememberMeId}
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-nnm-blue accent-nnm-blue focus:ring-nnm-blue"
          />
          {t.rememberMe}
        </label>
      </div>

      <p className="mb-5 text-xs text-slate-400">{t.forgotPassword}</p>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nnm-blue-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? t.loggingIn : t.logIn}
      </button>
    </form>
  );
}
