"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Building2, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  approveBooking,
  cancelBooking,
  createHall,
  dmy,
  fetchBooking,
  fetchBookings,
  fetchHalls,
  range,
  recordHallPayment,
  rejectBooking,
  rupees,
  settleHallDeposit,
  updateHall,
  type BookingList,
  type Hall,
  type HallBooking,
} from "@/lib/community-hall-api";

const VIEWERS = ["community_hall_prabhari", "commissioner", "deputy_commissioner", "city_manager"];
const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const label = "mb-1 block text-xs font-medium text-slate-600";

type Tab = "applied" | "approved" | "upcoming" | "deposit" | "all" | "halls";
const TABS: { value: Tab; label: string; count?: keyof BookingList["counts"] }[] = [
  { value: "applied", label: "Applications", count: "applied" },
  { value: "approved", label: "Awaiting payment", count: "approved" },
  { value: "upcoming", label: "Confirmed - upcoming", count: "upcoming" },
  { value: "deposit", label: "Deposit to settle", count: "deposit" },
  { value: "all", label: "All bookings" },
  { value: "halls", label: "Halls & rent" },
];
const STATUS_TONE: Record<string, string> = {
  applied: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-slate-200 text-slate-600",
  cancelled: "bg-slate-200 text-slate-600",
  expired: "bg-slate-200 text-slate-600",
};

/**
 * Community halls - office. Community Hall Prabhari / Municipal Commissioner: approve or reject applications, record
 * the payment made at the office (confirming the booking), cancel, and settle the deposit after the function. The
 * Commissioner sets each hall's rent and deposit. DMC and City Manager: view.
 */
export default function CommunityHallsOfficePage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<Tab>("applied");
  const [q, setQ] = useState("");
  const [list, setList] = useState<BookingList | null>(null);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, h] = await Promise.all([fetchBookings({ status: tab === "halls" ? "applied" : tab, q }), fetchHalls()]);
      setList(l);
      setHalls(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [tab, q]);

  useEffect(() => {
    if (admin && VIEWERS.includes(admin.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search runs on Enter / button
  }, [admin, tab]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!VIEWERS.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Not available for your login.
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Building2 className="h-6 w-6 text-nnm-blue" /> Community Hall Bookings
          </h1>
          <p className="text-sm text-slate-500">
            Applications come from the public page (/community-halls). Approve, then the applicant pays rent + deposit by the due date and
            the booking is confirmed.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === t.value ? "bg-nnm-blue text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {t.label}
              {t.count && list?.counts[t.count] ? (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab === t.value ? "bg-white/25" : "bg-red-600 text-white"}`}>
                  {list.counts[t.count]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {tab === "halls" ? (
          <HallsSection halls={halls} canEdit={admin.role === "commissioner"} onSaved={load} />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Booking no. / name / mobile"
                className={`${input} max-w-xs`}
              />
              <button
                onClick={load}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold"
              >
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
            {!list ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : list.bookings.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nothing here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.bookings.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setOpenId(b.id)}
                      className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {b.hallName} · {range(b.fromDate, b.toDate)}
                        </p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{b.bookingNo}</span> · {b.applicantName} ({b.applicantPhone}) · {b.purpose} ·{" "}
                          {rupees(b.totalAmount)}
                          {b.status === "approved" && b.paymentDueDate ? ` · pay by ${dmy(b.paymentDueDate)}` : ""}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[b.status]}`}>{b.statusLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      {openId !== null && (
        <BookingPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function BookingPanel({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchBooking>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("cash");
  const [ref, setRef] = useState("");
  const [deduct, setDeduct] = useState("0");

  const load = useCallback(() => {
    fetchBooking(id)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [id]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setText("");
      setRef("");
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const b: HallBooking | undefined = d?.booking;
  const need = (msg: string) => {
    if (text.trim().length < 3) {
      setError(msg);
      return false;
    }
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Booking {b?.bookingNo ?? ""}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!d || !b ? (
          error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          )
        ) : (
          <div className="space-y-4 text-sm">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[b.status]}`}>{b.statusLabel}</span>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {(
                [
                  ["Hall", b.hallName],
                  ["Dates", `${range(b.fromDate, b.toDate)} (${b.days} day${b.days > 1 ? "s" : ""})`],
                  ["Applicant", `${b.applicantName}, ${b.applicantPhone}`],
                  ["Address", b.applicantAddress],
                  ["Purpose", `${b.purpose}${b.expectedGuests ? ` - about ${b.expectedGuests} guests` : ""}`],
                  ["Amount", `Rent ${rupees(b.rentAmount)} + deposit ${rupees(b.depositAmount)} = ${rupees(b.totalAmount)}`],
                  ...(b.paymentDueDate && b.status === "approved" ? [["Pay by", dmy(b.paymentDueDate)]] : []),
                  ...(b.paidAt
                    ? [
                        [
                          "Paid",
                          `${new Date(b.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} - ${b.paymentModeLabel}${b.paymentReference ? ` (${b.paymentReference})` : ""}, recorded by ${b.paymentRecordedBy ?? "-"}`,
                        ],
                      ]
                    : []),
                  ...(b.depositStatus === "settled"
                    ? [
                        [
                          "Deposit",
                          `Refunded ${rupees(b.depositRefunded ?? 0)}${b.depositDeducted ? `, deducted ${rupees(b.depositDeducted)}: ${b.depositRemarks}` : ""} (${b.depositSettledBy})`,
                        ],
                      ]
                    : []),
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>

            {d.overlapping.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Other bookings on these dates:</p>
                {d.overlapping.map((o) => (
                  <p key={o.booking_no}>
                    {o.booking_no} - {o.applicant_name} ({range(o.from_date, o.to_date)}) - {o.status}
                  </p>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            {d.canDecide && b.status === "applied" && (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <label className={label} htmlFor="bp-text">
                  Remarks (required to reject)
                </label>
                <input id="bp-text" value={text} onChange={(e) => setText(e.target.value)} className={input} />
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => approveBooking(b.id, text.trim()),
                        "Approve this booking? The dates will be held until the payment due date.",
                      )
                    }
                    className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => need("Write the reason for rejecting.") && act(() => rejectBooking(b.id, text.trim()))}
                    className="rounded-md border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {d.canDecide && b.status === "approved" && (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <p className="font-semibold text-slate-800">Payment received at the office ({rupees(b.totalAmount)})</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["cash", "Cash"],
                    ["pos_card", "Card (POS)"],
                    ["pos_upi", "UPI (POS)"],
                    ["dd", "Demand draft"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMode(v)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === v ? "bg-nnm-blue text-white" : "border border-slate-300"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {mode !== "cash" && (
                  <input
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    placeholder={mode === "dd" ? "DD number and bank" : "Approval code / RRN on the POS slip"}
                    className={input}
                  />
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => recordHallPayment(b.id, mode, ref.trim()),
                      `Record ${rupees(b.totalAmount)} received and confirm the booking?`,
                    )
                  }
                  className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Record payment and confirm
                </button>
              </div>
            )}

            {d.canDecide && b.status === "confirmed" && b.depositStatus === "held" && b.eventOver && (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <p className="font-semibold text-slate-800">Settle the security deposit ({rupees(b.depositAmount)})</p>
                <label className={label} htmlFor="bp-deduct">
                  Deduction for damage / dues (₹)
                </label>
                <input
                  id="bp-deduct"
                  inputMode="decimal"
                  value={deduct}
                  onChange={(e) => setDeduct(e.target.value)}
                  className={`${input} max-w-[10rem]`}
                />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Reason for the deduction (if any)"
                  className={input}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => settleHallDeposit(b.id, Number(deduct) || 0, text.trim()),
                      `Refund ${rupees(b.depositAmount - (Number(deduct) || 0))} of the deposit?`,
                    )
                  }
                  className="rounded-md bg-nnm-blue px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Settle deposit
                </button>
              </div>
            )}

            {d.canDecide && (["applied", "approved"].includes(b.status) || (b.status === "confirmed" && !b.eventOver)) ? (
              <details className="rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer font-semibold text-red-700">Cancel this booking</summary>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Reason for cancelling"
                  className={`${input} mt-2`}
                />
                {b.status === "confirmed" && (
                  <p className="mt-1 text-xs text-slate-500">
                    The booking is paid - any refund is made outside the portal; note it in the reason.
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    need("Write the reason for cancelling.") && act(() => cancelBooking(b.id, text.trim()), "Cancel this booking?")
                  }
                  className="mt-2 rounded-md border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
                >
                  Cancel booking
                </button>
              </details>
            ) : null}

            {b.events && b.events.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-slate-800">History</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {b.events.map((e, i) => (
                    <li key={i}>
                      {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} - <b>{e.action}</b> by {e.by}
                      {e.note ? `: ${e.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HallsSection({ halls, canEdit, onSaved }: { halls: Hall[]; canEdit: boolean; onSaved: () => void }) {
  const empty = { name: "", nameHi: "", address: "", capacity: "", facilities: "", dailyRent: "", securityDeposit: "", active: true };
  const [edit, setEdit] = useState<{ id: number | null; f: typeof empty } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!edit) return;
    const f = edit.f;
    if (!f.name.trim() || f.dailyRent === "" || f.securityDeposit === "")
      return setError("Enter the name, daily rent and security deposit.");
    const body = {
      name: f.name,
      nameHi: f.nameHi || null,
      address: f.address || null,
      capacity: f.capacity ? Number(f.capacity) : null,
      facilities: f.facilities || null,
      dailyRent: Number(f.dailyRent),
      securityDeposit: Number(f.securityDeposit),
      active: f.active,
    };
    try {
      if (edit.id) await updateHall(edit.id, body);
      else await createHall(body);
      setEdit(null);
      setError(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  const setF = (k: keyof typeof empty, v: string | boolean) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {halls.length === 0 && <p className="text-sm text-slate-400">No hall added yet.</p>}
      {halls.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">
              {h.name} {!h.active && <span className="text-xs font-normal text-red-600">(closed for booking)</span>}
            </p>
            <p className="text-xs text-slate-500">
              Rent {rupees(h.daily_rent)}/day · Deposit {rupees(h.security_deposit)}
              {h.capacity ? ` · ${h.capacity} guests` : ""}
              {h.address ? ` · ${h.address}` : ""}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() =>
                setEdit({
                  id: h.id,
                  f: {
                    name: h.name,
                    nameHi: h.name_hi ?? "",
                    address: h.address ?? "",
                    capacity: h.capacity ? String(h.capacity) : "",
                    facilities: h.facilities ?? "",
                    dailyRent: String(h.daily_rent),
                    securityDeposit: String(h.security_deposit),
                    active: h.active,
                  },
                })
              }
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      ))}
      {canEdit ? (
        edit ? (
          <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
            {(
              [
                ["name", "Name *"],
                ["nameHi", "Name in Hindi"],
                ["address", "Address"],
                ["capacity", "Capacity (guests)"],
                ["dailyRent", "Rent per day (₹) *"],
                ["securityDeposit", "Security deposit (₹) *"],
                ["facilities", "Facilities"],
              ] as [keyof typeof empty, string][]
            ).map(([k, l]) => (
              <div key={k} className={k === "facilities" || k === "address" ? "sm:col-span-2" : ""}>
                <label className={label}>{l}</label>
                <input value={String(edit.f[k])} onChange={(e) => setF(k, e.target.value)} className={input} />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.f.active} onChange={(e) => setF("active", e.target.checked)} /> Open for booking
            </label>
            {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button onClick={save} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
                Save
              </button>
              <button onClick={() => setEdit(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              A change of rent applies to new applications; bookings already made keep their amounts.
            </p>
          </div>
        ) : (
          <button
            onClick={() => setEdit({ id: null, f: empty })}
            className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Add hall
          </button>
        )
      ) : (
        <p className="text-xs text-slate-400">The halls, rent and deposit are set by the Municipal Commissioner.</p>
      )}
    </section>
  );
}
