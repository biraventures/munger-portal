import Link from "next/link";
import Image from "next/image";
import logoImg from '@/public/logo.png'

export interface PortalBrandingHeaderProps {
  homeHref?: string;
}

export function PortalBrandingHeader({
  homeHref = "/portal-login",
}: PortalBrandingHeaderProps) {
  return (
    <>
      <div className="bg-nnm-blue-dark py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-white/70">
        Government of Bihar
      </div>
      <header className="flex justify-center pb-2 pt-10">
        <Link href={homeHref} className="flex flex-col items-center gap-3 text-center">
          <Image src={logoImg} alt="Munger Nagar Nigam" width={56} height={56} className="h-14 w-14" priority />
          <span>
            <span className="block font-display text-lg font-semibold text-slate-900">
              मुंगेर नगर निगम
            </span>
            <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
              Munger Nagar Nigam · Portal Access
            </span>
          </span>
        </Link>
      </header>
    </>
  );
}