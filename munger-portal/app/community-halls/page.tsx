"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building2, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { applyForHall, dmy, fetchPublicHalls, rupees, type PublicHall, type PublicHalls } from "@/lib/community-hall-api";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const label = "mb-1 block text-xs font-medium text-slate-600";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
const isTaken = (h: PublicHall, day: string) => h.taken.some((t) => t.from <= day && day <= t.to);

/** Month calendar of one hall: booked days in red, days that cannot be booked greyed; a free day can be picked. */
function HallCalendar({
  hall,
  min,
  max,
  from,
  to,
  onPick,
}: {
  hall: PublicHall;
  min: string;
  max: string;
  from: string;
  to: string;
  onPick: (day: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(min);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const first = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: count }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const canBack = iso(new Date(month.getFullYear(), month.getMonth(), 0)) >= min.slice(0, 8) + "01";
  const canNext = iso(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <= max;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canBack}
          aria-label="Previous month"
          className="rounded p-1 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canNext}
          aria-label="Next month"
          className="rounded p-1 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="font-semibold text-slate-400">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const out = day < min || day > max;
          const taken = isTaken(hall, day);
          const picked = !!from && (day === from || (!!to && from <= day && day <= to));
          return (
            <button
              key={i}
              type="button"
              disabled={out || taken}
              onClick={() => onPick(day)}
              title={taken ? "Booked" : out ? "Not open for booking" : "Available"}
              className={`rounded py-1 ${taken ? "bg-red-100 font-semibold text-red-700" : out ? "text-slate-300" : picked ? "bg-nnm-blue font-semibold text-white" : "bg-green-50 text-green-800 hover:bg-green-200"}`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex gap-3 text-[11px] text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-green-200 align-middle" />
          Available
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-red-200 align-middle" />
          Booked
        </span>
      </p>
    </div>
  );
}

/**
 * Public: Nagar Nigam's community halls - rent, deposit and booked dates - and the booking application. The office
 * approves an application; the applicant then pays the rent and deposit, and the booking is confirmed.
 */
export default function CommunityHallsPage() {
  const [data, setData] = useState<PublicHalls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hallId, setHallId] = useState<number | null>(null);
  const [form, setForm] = useState({
    fromDate: "",
    toDate: "",
    applicantName: "",
    applicantPhone: "",
    applicantAddress: "",
    purpose: "",
    expectedGuests: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ bookingNo: string; link: string } | null>(null);

  useEffect(() => {
    fetchPublicHalls()
      .then((d) => {
        setData(d);
        if (d.halls[0]) setHallId(d.halls[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the halls."));
  }, []);

  const hall = data?.halls.find((h) => h.id === hallId) ?? null;
  const days = form.fromDate && form.toDate ? daysBetween(form.fromDate, form.toDate) : 0;
  const clash = useMemo(() => {
    if (!hall || days < 1) return false;
    for (let d = new Date(form.fromDate); iso(d) <= form.toDate; d.setDate(d.getDate() + 1)) if (isTaken(hall, iso(d))) return true;
    return false;
  }, [hall, days, form.fromDate, form.toDate]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hall) return;
    if (days < 1) return setError("Choose the first and last day.");
    if (days > (data?.maxDays ?? 15)) return setError(`At most ${data?.maxDays} days in one booking.`);
    if (clash) return setError("The hall is already booked on some of these dates - choose other dates.");
    if (!/^[6-9]\d{9}$/.test(form.applicantPhone)) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    try {
      setDone(
        await applyForHall({
          hallId: hall.id,
          fromDate: form.fromDate,
          toDate: form.toDate,
          applicantName: form.applicantName,
          applicantPhone: form.applicantPhone,
          applicantAddress: form.applicantAddress,
          purpose: form.purpose,
          expectedGuests: form.expectedGuests ? Number(form.expectedGuests) : null,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Building2 className="h-6 w-6 text-nnm-blue" /> Community Hall Booking
            </h1>
            <p className="text-sm text-slate-500">
              सामुदायिक भवन बुकिंग - Munger Nagar Nigam&apos;s community halls for weddings and functions.
            </p>
          </div>
          <Link href="/community-halls/booking" className="text-sm font-semibold text-nnm-blue underline">
            Check my booking status
          </Link>
        </div>

        {done ? (
          <div className="rounded-xl border border-green-200 bg-white p-6">
            <p className="mb-2 flex items-center gap-2 text-lg font-semibold text-green-700">
              <CheckCircle2 className="h-5 w-5" /> Application submitted
            </p>
            <p className="text-sm text-slate-700">
              Your booking number is <b className="font-mono">{done.bookingNo}</b>. Note it down. The Nagar Nigam office will check the
              application; once it is approved you will have to pay the rent and security deposit by the date shown on the status page to
              confirm the booking.
            </p>
            <Link
              href={done.link.replace(/^https?:\/\/[^/]+/, "")}
              className="mt-4 inline-block rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
            >
              See the status of my booking
            </Link>
          </div>
        ) : !data ? (
          error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          )
        ) : data.halls.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No hall is open for booking at present.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.halls.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHallId(h.id)}
                  className={`rounded-xl border bg-white p-4 text-left ${h.id === hallId ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"}`}
                >
                  <p className="text-base font-semibold text-slate-900">
                    {h.name}
                    {h.name_hi && <span className="ml-2 text-sm font-normal text-slate-500">{h.name_hi}</span>}
                  </p>
                  {h.address && <p className="text-xs text-slate-500">{h.address}</p>}
                  <p className="mt-2 text-sm text-slate-700">
                    Rent <b>{rupees(h.daily_rent)}</b> per day · Security deposit <b>{rupees(h.security_deposit)}</b> (refundable)
                  </p>
                  {(h.capacity || h.facilities) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      {h.capacity && (
                        <>
                          <Users className="h-3.5 w-3.5" /> Up to {h.capacity} guests
                        </>
                      )}
                      {h.capacity && h.facilities ? " · " : ""}
                      {h.facilities}
                    </p>
                  )}
                </button>
              ))}
            </div>

            {hall && (
              <form
                onSubmit={submit}
                className="grid gap-6 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
              >
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">{hall.name} - availability</p>
                  <HallCalendar
                    key={hall.id}
                    hall={hall}
                    min={data.minDate}
                    max={data.maxDate}
                    from={form.fromDate}
                    to={form.toDate}
                    onPick={(day) =>
                      setForm((f) =>
                        !f.fromDate || f.toDate || day < f.fromDate ? { ...f, fromDate: day, toDate: "" } : { ...f, toDate: day },
                      )
                    }
                  />
                  <p className="mt-2 text-xs text-slate-500">Tap the first day, then the last day (same day again for one day).</p>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label} htmlFor="h-from">
                        First day *
                      </label>
                      <input
                        id="h-from"
                        type="date"
                        required
                        min={data.minDate}
                        max={data.maxDate}
                        value={form.fromDate}
                        onChange={(e) => set("fromDate", e.target.value)}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="h-to">
                        Last day *
                      </label>
                      <input
                        id="h-to"
                        type="date"
                        required
                        min={form.fromDate || data.minDate}
                        max={data.maxDate}
                        value={form.toDate}
                        onChange={(e) => set("toDate", e.target.value)}
                        className={input}
                      />
                    </div>
                  </div>
                  {days > 0 && (
                    <p className={`rounded-md p-2 text-sm ${clash ? "bg-red-50 text-red-700" : "bg-blue-50 text-slate-700"}`}>
                      {clash ? (
                        "The hall is already booked on some of these dates."
                      ) : (
                        <>
                          {days} day{days > 1 ? "s" : ""} ({dmy(form.fromDate)}
                          {days > 1 ? ` to ${dmy(form.toDate)}` : ""}): rent {rupees(hall.daily_rent * days)} + deposit{" "}
                          {rupees(hall.security_deposit)} = <b>{rupees(hall.daily_rent * days + hall.security_deposit)}</b>, payable after
                          approval.
                        </>
                      )}
                    </p>
                  )}
                  <div>
                    <label className={label} htmlFor="h-name">
                      Applicant&apos;s name *
                    </label>
                    <input
                      id="h-name"
                      required
                      value={form.applicantName}
                      onChange={(e) => set("applicantName", e.target.value)}
                      className={input}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label} htmlFor="h-phone">
                        Mobile number *
                      </label>
                      <input
                        id="h-phone"
                        required
                        inputMode="numeric"
                        maxLength={10}
                        value={form.applicantPhone}
                        onChange={(e) => set("applicantPhone", e.target.value.replace(/\D/g, ""))}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="h-guests">
                        Expected guests
                      </label>
                      <input
                        id="h-guests"
                        inputMode="numeric"
                        value={form.expectedGuests}
                        onChange={(e) => set("expectedGuests", e.target.value.replace(/\D/g, ""))}
                        className={input}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={label} htmlFor="h-address">
                      Address *
                    </label>
                    <textarea
                      id="h-address"
                      required
                      rows={2}
                      value={form.applicantAddress}
                      onChange={(e) => set("applicantAddress", e.target.value)}
                      className={input}
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="h-purpose">
                      Purpose / function *
                    </label>
                    <input
                      id="h-purpose"
                      required
                      value={form.purpose}
                      onChange={(e) => set("purpose", e.target.value)}
                      placeholder="e.g. Wedding reception"
                      className={input}
                    />
                  </div>
                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={busy || clash}
                    className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply for booking
                  </button>
                  <p className="text-xs text-slate-500">
                    After approval, pay the rent and deposit by the due date to confirm the booking
                    {data.onlinePayment ? " - online or at the Nagar Nigam office." : " at the Nagar Nigam office."} The deposit is refunded
                    after the function, less any damage.
                  </p>
                </div>
              </form>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
