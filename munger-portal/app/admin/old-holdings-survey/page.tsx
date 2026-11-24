"use client";

import { useEffect } from "react";

/** Replaced by Old Records (MIG) - kept so saved links still work. */
export default function OldHoldingsSurveyRedirect() {
  useEffect(() => {
    window.location.replace("/admin/old-records");
  }, []);
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Opening Old Records (MIG)…</div>;
}
