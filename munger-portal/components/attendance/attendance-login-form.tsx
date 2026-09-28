"use client";

import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export interface AttendanceLoginValues {
  username: string;
  password: string;
  rememberMe: boolean;
}

export function AttendanceLoginForm({
  onSubmit,
}: {
  onSubmit: (values: AttendanceLoginValues) => Promise<void>;
}) {
  const usernameId = useId();
  const passwordId = useId();
  const rememberMeId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ username: username.trim(), password, rememberMe });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't log you in. Check your username and password, then try again.");
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
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Asset Management Login</h1>
      <p className="mb-6 text-sm text-slate-500">Field staff attendance, fleet, street lights, submersible pyau, and related roles.</p>

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor={usernameId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id={usernameId}
          type="text"
          autoComplete="username"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
        />
      </div>

      <div className="mb-4">
        <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-nnm-blue focus-within:ring-offset-1">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
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
          Remember me
        </label>
      </div>

      <p className="mb-5 text-xs text-slate-400">Forgot your password? Contact your Attendance Admin to have it reset.</p>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nnm-blue-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}
