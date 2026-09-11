"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Root error boundary (Next.js App Router convention) - catches any
 * uncaught client-side exception thrown while rendering a page under
 * this layout, so the person sees a specific, actionable message
 * instead of the generic "Application error: a client-side exception
 * has occurred" crash screen with no way forward except reloading
 * blind. Logs the real error to the console either way, so it's still
 * inspectable there for diagnosis.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled client-side error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mb-1 text-sm text-slate-500">
          This page ran into an unexpected error while loading. Nothing you entered elsewhere has been lost.
        </p>
        {error.message && (
          <p className="mb-5 mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs text-slate-600">
            {error.message}
            {error.digest && <span className="mt-1 block text-slate-400">Reference: {error.digest}</span>}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
