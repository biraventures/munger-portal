"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { adminLogout, ADMIN_ROLE_LABELS, type AdminInfo } from "@/lib/admin-auth";
import logoImg from '@/public/logo.png'

export function AdminHeader({ admin }: { admin: AdminInfo }) {
  const router = useRouter();

  function handleLogout() {
    adminLogout();
    router.push("/portal-login/admin");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/admin/dashboard" className="flex items-center gap-2.5">
          <Image src={logoImg} alt="Munger Nagar Nigam" width={32} height={32} className="h-8 w-8 shrink-0" />
          <span className="text-sm font-semibold text-slate-900">NNM Admin Portal</span>
        </Link>
        <nav className="hidden sm:block">
          <Link href="/admin/dashboard" className="text-sm font-semibold text-slate-500 hover:text-nnm-blue">
            Dashboard
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-right text-sm leading-tight text-slate-500">
            {admin.displayName}
            <span className="block text-xs text-slate-400">{ADMIN_ROLE_LABELS[admin.role]}</span>
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}