"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export interface StaffLoginValues {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface StaffLoginFormProps {
  role: "admin" | "operator";
  heading: string;
  description: string;
  /** Called with validated form values. Throw to surface an error message. */
  onSubmit?: (values: StaffLoginValues) => Promise<void> | void;
  backHref?: string;
}

export function StaffLoginForm({
  role,
  heading,
  description,
  onSubmit,
  backHref = "/portal-login",
}: StaffLoginFormProps) {
  const usernameId = useId();
  const passwordId = useId();
  const rememberMeId = useId();
  const usernameErrorId = `${usernameId}-error`;
  const passwordErrorId = `${passwordId}-error`;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): boolean {
    const errors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      errors.username = "Enter your username.";
    }

    if (!password) {
      errors.password = "Enter your password.";
    } else if (password.length < 4) {
      errors.password = "Password must be at least 4 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit({ username: username.trim(), password, rememberMe });
      } else {
        // Placeholder behaviour until an auth endpoint is wired up.
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "We couldn't log you in. Check your username and password, then try again.",
      );
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
      <h1 className="mb-1 text-xl font-semibold text-slate-900">{heading}</h1>
      <p className="mb-6 text-sm text-slate-500">{description}</p>

      {formError && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {formError}
        </div>
      )}

      <div className="mb-4">
        <label
          htmlFor={usernameId}
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Username
        </label>
        <input
          id={usernameId}
          type="text"
          autoComplete="username"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={
            fieldErrors.username ? usernameErrorId : undefined
          }
          className="w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
        />
        {fieldErrors.username && (
          <p id={usernameErrorId} className="mt-1.5 text-xs text-red-600">
            {fieldErrors.username}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label
          htmlFor={passwordId}
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
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
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? passwordErrorId : undefined
            }
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="flex items-center px-3 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:text-nnm-blue"
          >
            {showPassword ? (
              <EyeOff className="h-[18px] w-[18px]" />
            ) : (
              <Eye className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
        {fieldErrors.password && (
          <p id={passwordErrorId} className="mt-1.5 text-xs text-red-600">
            {fieldErrors.password}
          </p>
        )}
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
        <Link href={`/portal-login/${role}/forgot-password`} className="text-xs font-medium text-nnm-blue hover:underline">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nnm-blue-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Logging in…" : "Log In"}
      </button>

      <Link
        href={backHref}
        className="mt-5 block text-center text-xs font-medium text-nnm-blue hover:underline"
      >
        ← Back to portal access
      </Link>
    </form>
  );
}