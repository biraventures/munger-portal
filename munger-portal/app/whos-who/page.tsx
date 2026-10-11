"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Phone, Search, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  fetchPublicWhosWho,
  formatIsoDate,
  formatPhone,
  whosWhoPhotoUrl,
  type WhosWhoDesignation,
  type WhosWhoPublicEntry,
} from "@/lib/whos-who-api";

const ELECTED = ["mayor", "deputy_mayor"];

function Photo({ e, className }: { e: WhosWhoPublicEntry; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className={`${className} flex items-center justify-center bg-paper-dim text-ink-soft`}>
        <UserRound className="h-10 w-10" strokeWidth={1.4} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={whosWhoPhotoUrl(e)} alt={e.name_en} loading="lazy" onError={() => setBroken(true)} className={`${className} object-cover`} />;
}

function Card({ e, d, large }: { e: WhosWhoPublicEntry; d?: WhosWhoDesignation; large?: boolean }) {
  const title = e.designation === "ward_councillor" ? `${d?.en ?? "Ward Councillor"} · Ward ${e.ward_no}` : d?.en ?? e.designation;
  const titleHi = e.designation === "ward_councillor" ? `${d?.hi ?? ""}, वार्ड ${e.ward_no}` : d?.hi;
  return (
    <article className={`flex gap-4 rounded-xl border border-line bg-white p-4 ${large ? "sm:p-6" : ""}`}>
      <Photo e={e} className={`${large ? "h-36 w-28 sm:h-44 sm:w-36" : "h-28 w-22"} shrink-0 rounded-lg`} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-nnm-blue">{title}</p>
        {titleHi && <p className="text-xs text-ink-soft">{titleHi}</p>}
        <h3 className={`mt-1.5 font-display font-semibold leading-snug text-ink ${large ? "text-xl" : "text-base"}`}>{e.name_hi || e.name_en}</h3>
        {e.name_hi && <p className="text-sm text-ink-soft">{e.name_en}</p>}
        {e.area_charge && <p className="mt-1 text-xs text-ink-soft">{e.area_charge}</p>}
        <p className="mt-2 text-xs text-ink-soft">In office since {formatIsoDate(e.date_assumed_office)}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href={`tel:${e.contact_number}`} className="inline-flex items-center gap-1.5 font-semibold text-nnm-blue hover:underline">
            <Phone className="h-3.5 w-3.5" /> {formatPhone(e.contact_number)}
          </a>
          {e.email && (
            <a href={`mailto:${e.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-ink-soft hover:text-nnm-blue">
              <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{e.email}</span>
            </a>
          )}
        </div>
        {e.public_message && (
          <blockquote className="mt-3 border-l-2 border-nnm-gold pl-3 text-sm italic leading-relaxed text-ink">{e.public_message}</blockquote>
        )}
      </div>
    </article>
  );
}

export default function WhosWhoPage() {
  const [entries, setEntries] = useState<WhosWhoPublicEntry[] | null>(null);
  const [designations, setDesignations] = useState<WhosWhoDesignation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchPublicWhosWho()
      .then((r) => {
        setEntries(r.entries);
        setDesignations(r.designations);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load."));
  }, []);

  const byKey = useMemo(() => Object.fromEntries(designations.map((d) => [d.key, d])), [designations]);
  const elected = (entries ?? []).filter((e) => ELECTED.includes(e.designation));
  const officers = (entries ?? []).filter((e) => !ELECTED.includes(e.designation) && e.designation !== "ward_councillor");
  const q = query.trim().toLowerCase();
  const councillors = (entries ?? [])
    .filter((e) => e.designation === "ward_councillor")
    .filter((e) => !q || String(e.ward_no) === q || e.name_en.toLowerCase().includes(q) || (e.name_hi ?? "").includes(query.trim()));

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-ink">Who&apos;s Who</h1>
        <p className="mt-1 text-sm text-ink-soft">कौन क्या है · Elected representatives and officers of Munger Nagar Nigam, with their contact numbers.</p>

        {error && (
          <div role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {!error && entries === null && (
          <div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {entries?.length === 0 && <p className="py-10 text-sm text-ink-soft">Details will be published here shortly.</p>}

        {elected.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-ink">Elected Representatives · निर्वाचित प्रतिनिधि</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {elected.map((e) => (
                <Card key={e.id} e={e} d={byKey[e.designation]} large />
              ))}
            </div>
          </section>
        )}

        {officers.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-semibold text-ink">Officers · पदाधिकारी</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {officers.map((e) => (
                <Card key={e.id} e={e} d={byKey[e.designation]} />
              ))}
            </div>
          </section>
        )}

        {entries && entries.some((e) => e.designation === "ward_councillor") && (
          <section className="mt-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Ward Councillors · वार्ड पार्षद</h2>
              <label className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by ward no. or name"
                  className="w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-nnm-blue focus:outline-none"
                />
              </label>
            </div>
            {councillors.length === 0 ? (
              <p className="text-sm text-ink-soft">No match.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {councillors.map((e) => (
                  <Card key={e.id} e={e} d={byKey[e.designation]} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
