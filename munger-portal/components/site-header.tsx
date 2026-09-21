"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PROPERTY_TAX_SEARCH_PATH } from "@/lib/config";
import { getOperatorToken } from "@/lib/auth";
import { getAdminToken } from "@/lib/admin-auth";
import logoImg from '@/public/logo.png'

export function SiteHeader() {
  const [staffSignedIn, setStaffSignedIn] = useState(false);

  useEffect(() => {
    setStaffSignedIn(Boolean(getOperatorToken() || getAdminToken()));
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <Image src={logoImg} alt="Munger Nagar Nigam" width={40} height={40} className="h-10 w-10 shrink-0" priority />
          <span className="leading-tight">
            <span className="block font-display text-[16.5px] font-semibold text-ink">
              मुंगेर नगर निगम
            </span>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-soft">
              Munger Nagar Nigam
            </span>
          </span>
        </Link>

        {!staffSignedIn && (
          <nav className="hidden items-center gap-7 md:flex">
            <Link href="/" className="text-[14.5px] font-semibold text-ink-soft hover:text-nnm-blue">
              Home
            </Link>
            <Link href="/#about" className="text-[14.5px] font-semibold text-ink-soft hover:text-nnm-blue">
              About
            </Link>
            <Link href="/#services" className="text-[14.5px] font-semibold text-ink-soft hover:text-nnm-blue">
              Services
            </Link>
            <Link href="/#contact" className="text-[14.5px] font-semibold text-ink-soft hover:text-nnm-blue">
              Contact
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden items-center rounded-md border-[1.5px] border-nnm-blue px-3.5 py-2.5 text-[13px] font-semibold text-nnm-blue transition-colors hover:bg-blue-50 sm:inline-flex"
          >
            Citizen Login
          </Link>
          <Link
            href="/portal-login"
            className="hidden items-center rounded-md border-[1.5px] border-ink-soft/40 px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-nnm-blue hover:text-nnm-blue sm:inline-flex"
          >
            Office Login
          </Link>
          <Link
            href={PROPERTY_TAX_SEARCH_PATH}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-gold px-4 py-2.5 text-[13px] font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px"
          >
            Pay Property Tax
          </Link>
        </div>
      </div>
    </header>
  );
}