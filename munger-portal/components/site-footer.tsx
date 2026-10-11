import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-nnm-blue-dark py-9 text-[13.5px] text-white/75">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6">
        <span>© 2026 Munger Nagar Nigam · Government of Bihar</span>
        <div className="flex gap-5">
          <Link href="#about" className="hover:text-white">
            About
          </Link>
          <Link href="#services" className="hover:text-white">
            Services
          </Link>
          <Link href="/whos-who" className="whitespace-nowrap hover:text-white">
            Who&apos;s Who
          </Link>
          <Link href="/documents" className="hover:text-white">
            Documents
          </Link>
          <Link href="#contact" className="hover:text-white">
            Contact
          </Link>
        </div>
      </div>
      {/* Policy links sit in their own row at the very bottom of the page. */}
      <div className="mx-auto mt-5 max-w-6xl border-t border-white/15 px-6 pt-4">
        <nav aria-label="Policies" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12.5px]">
          <Link href="/terms" className="hover:text-white">
            Terms &amp; Conditions
          </Link>
          <Link href="/refund-policy" className="hover:text-white">
            Refund &amp; Cancellation Policy
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
