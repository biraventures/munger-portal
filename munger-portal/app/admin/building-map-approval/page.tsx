"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Replaced by the building plan permit screens. */
export default function BuildingMapApprovalRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/admin/building-permits"), [router]);
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
}
