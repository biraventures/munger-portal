import Link from "next/link";
import {
  Receipt,
  Trash2,
  Droplet,
  Store,
  FileText,
  AlertTriangle,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { services } from "@/lib/config";

const ICONS: Record<string, LucideIcon> = {
  receipt: Receipt,
  trash: Trash2,
  droplet: Droplet,
  store: Store,
  "file-text": FileText,
  "alert-triangle": AlertTriangle,
  lightbulb: Lightbulb,
};

export function Services() {
  return (
    <section id="services" className="bg-paper-dim py-20">
      <div className="mx-auto max-w-6xl px-6">
        <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-ganga-teal">
          Citizen services
        </span>
        <h2 className="mb-3 font-display text-3xl font-semibold text-ink">
          Find your counter
        </h2>
        <p className="max-w-lg text-[17px] text-ink-soft">
          Each service below works the way a physical counter at the Nigam
          office does — pick the one you need.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = ICONS[service.icon];
            return (
              <article
                key={service.title}
                className="rounded-[10px] border border-line bg-card"
              >
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold tracking-[0.08em] text-ganga-teal">
                    {service.counter}
                  </span>
                  <Icon className="h-[22px] w-[22px] text-nnm-blue" strokeWidth={1.8} />
                </div>
                <div className="perforation" />
                <div className="px-5 pb-[22px] pt-[18px]">
                  <h3 className="mb-2 text-[16.5px] font-semibold text-ink">
                    {service.title}
                  </h3>
                  <p className="mb-[18px] min-h-[58px] text-[13.8px] text-ink-soft">
                    {service.description}
                  </p>
                  {service.live ? (
                    <Link
                      href={service.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-nnm-gold px-4 py-2.5 text-[13px] font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px"
                    >
                      {service.cta}
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-default items-center gap-2 rounded-md border-[1.5px] border-dashed border-line px-4 py-2.5 text-[13px] font-semibold text-[#8b8471]">
                      {service.cta}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
