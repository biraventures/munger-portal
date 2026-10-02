"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  attendanceLogout,
  attendanceRoleLabel,
  type AttendanceUserInfo,
  type AttendanceRole,
} from "@/lib/attendance-auth";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import logoImg from '@/public/logo.png'

/**
 * Where the logo/name in the header should take each role when
 * clicked - their own home/dashboard page, not the login page. Every
 * role not listed explicitly here falls through to the general
 * dashboard, which already gates itself by role (see
 * app/attendance/dashboard/page.tsx's useAttendanceGuard list) - so a
 * role added there without an entry here still lands somewhere valid
 * rather than bouncing back to login.
 */
const HOME_PATH_BY_ROLE: Partial<Record<AttendanceRole, string>> = {
  jamadar: "/attendance/jamadar",
  driver_supervisor: "/attendance/drivers",
};

function homePathFor(role: AttendanceRole): string {
  return HOME_PATH_BY_ROLE[role] ?? "/attendance/dashboard";
}

const HEADER_STRINGS = {
  en: { title: "Asset Management", logOut: "Log out" },
  hi: { title: "एसेट प्रबंधन", logOut: "लॉग आउट" },
};

export function AttendanceHeader({ user }: { user: AttendanceUserInfo }) {
  const router = useRouter();
  const { lang, setLang } = useAttendanceLang();
  const s = HEADER_STRINGS[lang];

  function handleLogout() {
    attendanceLogout();
    router.push("/attendance-login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href={homePathFor(user.role)} className="flex items-center gap-2.5">
          <Image src={logoImg} alt="Munger Nagar Nigam" width={32} height={32} className="h-8 w-8 shrink-0" />
          <span className="text-sm font-semibold text-slate-900">{s.title}</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
              className={`rounded-md px-2 py-1 transition-colors ${
                lang === "en" ? "bg-nnm-blue text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              aria-pressed={lang === "hi"}
              className={`rounded-md px-2 py-1 transition-colors ${
                lang === "hi" ? "bg-nnm-blue text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              हिंदी
            </button>
          </div>
          <span className="text-right text-sm leading-tight text-slate-500">
            {user.displayName}
            <span className="block text-xs text-slate-400">
              {attendanceRoleLabel(user.role, lang)}
              {user.wardName ? ` - ${user.wardName}` : ""}
            </span>
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {s.logOut}
          </button>
        </div>
      </div>
    </header>
  );
}
