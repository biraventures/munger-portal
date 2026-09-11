"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary - catches an uncaught exception thrown
 * within the root layout itself, which app/error.tsx cannot (it only
 * covers errors in the pages rendered inside that layout). Required
 * by Next.js to render its own <html>/<body>, since the root layout
 * that would normally provide them may be exactly what failed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled root-layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "24px" }}>
          <div style={{ maxWidth: "420px", width: "100%", textAlign: "center", border: "1px solid #e2e8f0", borderRadius: "12px", background: "white", padding: "32px" }}>
            <h1 style={{ marginBottom: "8px", fontSize: "18px", fontWeight: 600, color: "#0f172a" }}>Something went wrong</h1>
            <p style={{ marginBottom: "4px", fontSize: "14px", color: "#64748b" }}>The application ran into an unexpected error while loading.</p>
            {error.message && (
              <p style={{ marginTop: "12px", marginBottom: "20px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f8fafc", padding: "12px", textAlign: "left", fontFamily: "monospace", fontSize: "12px", color: "#475569" }}>
                {error.message}
              </p>
            )}
            <button
              onClick={reset}
              style={{ borderRadius: "6px", background: "#1a3d6d", padding: "8px 16px", fontSize: "14px", fontWeight: 600, color: "white", border: "none", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
