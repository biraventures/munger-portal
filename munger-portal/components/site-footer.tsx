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
          <Link href="/documents" className="hover:text-white">
            Documents
          </Link>
          <Link href="#contact" className="hover:text-white">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
