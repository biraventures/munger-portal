"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Plus, Printer, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  assignCounter,
  dmy,
  fetchCounterLogins,
  fetchGardenReport,
  fetchGardens,
  rupees,
  saveGarden,
  todayIst,
  type CounterLogin,
  type Garden,
  type GardenReport,
} from "@/lib/garden-api";

const OFFICERS = ["commissioner", "deputy_commissioner", "city_manager"];
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const card = "rounded-xl border border-slate-200 bg-white p-5";

type Form = { id?: number; name: string; nameHi: string; fee: string; max: string; active: boolean };

/**
 * Gardens with paid entry. Municipal Commissioner: adds gardens, sets the fee, assigns Garden Counter logins and prints
 * the garden's QR poster. MC, DMC and City Manager: daily / period report - tickets, persons, amount by payment mode
 * and by counter.
 */
export default function GardensPage() {
  const admin = useAdminGuard();
  const [gardens, setGardens] = useState<Garden[] | null>(null);
  const [logins, setLogins] = useState<CounterLogin[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [poster, setPoster] = useState<Garden | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isMc = admin?.role === "commissioner";

  const load = useCallback(() => {
    Promise.all([fetchGardens(), fetchCounterLogins()])
      .then(([g, l]) => {
        setGardens(g);
        setLogins(l);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, []);
  useEffect(() => {
    if (admin && OFFICERS.includes(admin.role)) load();
  }, [admin, load]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!OFFICERS.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-8 text-sm text-slate-500">This page is for the Municipal Commissioner, DMC and City Manager.</p>
      </div>
    );

  async function submit() {
    if (!form) return;
    setErr(null);
    try {
      await saveGarden({
        id: form.id,
        name: form.name,
        nameHi: form.nameHi.trim() || null,
        feePerPerson: Number(form.fee),
        maxPersonsPerTicket: Number(form.max) || 50,
        active: form.active,
      });
      setForm(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="print:hidden">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <div>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">Garden Entry Tickets</h1>
            <p className="text-sm text-slate-500">
              Counter sales (cash / bank POS), tickets checked at the gate by QR code, and the daily collection. Public online purchase is
              switched on once the garden&apos;s own payment gateway is integrated.
            </p>
          </div>
          {err && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</p>}

          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Gardens</h2>
              {isMc && !form && (
                <button
                  onClick={() => setForm({ name: "", nameHi: "", fee: "10", max: "50", active: true })}
                  className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Add garden
                </button>
              )}
            </div>
            {form && (
              <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Garden name
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                </label>
                <label className="text-xs text-slate-600">
                  Name in Hindi (optional)
                  <input value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} className={inputClass} />
                </label>
                <label className="text-xs text-slate-600">
                  Fee per person (₹)
                  <input
                    type="number"
                    min="0"
                    value={form.fee}
                    onChange={(e) => setForm({ ...form, fee: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Most persons on one ticket
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={form.max}
                    onChange={(e) => setForm({ ...form, max: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ticket
                  sale open
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    onClick={submit}
                    disabled={form.name.trim().length < 2 || form.fee === ""}
                    className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setForm(null)}
                    className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!gardens ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : gardens.length === 0 ? (
              <p className="text-sm text-slate-500">No garden added yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {gardens.map((g) => (
                  <div key={g.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{g.name}</p>
                        {g.name_hi && <p className="text-sm text-slate-600">{g.name_hi}</p>}
                        <p className="mt-1 text-sm text-slate-600">
                          {rupees(g.fee_per_person)} per person · up to {g.max_persons_per_ticket} on a ticket ·{" "}
                          <span className={g.active ? "text-green-700" : "text-red-600"}>{g.active ? "sale open" : "sale closed"}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Counter: {g.staff.length ? g.staff.map((s) => s.name).join(", ") : "none assigned"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        {isMc && (
                          <button
                            onClick={() =>
                              setForm({
                                id: g.id,
                                name: g.name,
                                nameHi: g.name_hi ?? "",
                                fee: String(g.fee_per_person),
                                max: String(g.max_persons_per_ticket),
                                active: g.active,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        )}
                        <button
                          onClick={() => setPoster(g)}
                          className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 text-xs font-semibold text-nnm-blue"
                        >
                          <Printer className="h-3 w-3" /> QR poster
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="mb-1 text-base font-semibold text-slate-900">Counter logins</h2>
            <p className="mb-3 text-xs text-slate-500">
              Create the login on the server with role <code>garden_counter</code> (<code>npm run create-admin</code>), then choose its
              garden here. A Garden Counter login can only sell and check tickets of its own garden.
            </p>
            {logins.length === 0 ? (
              <p className="text-sm text-slate-500">No Garden Counter login yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {logins.map((l) => (
                    <tr key={l.username} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3">
                        <b>{l.display_name}</b> <span className="text-xs text-slate-500">({l.username})</span>
                        {!l.active && <span className="ml-1 text-xs text-red-600">switched off</span>}
                      </td>
                      <td className="py-2">
                        {isMc ? (
                          <select
                            value={l.garden_id ?? ""}
                            onChange={(e) =>
                              assignCounter(l.username, e.target.value ? Number(e.target.value) : null)
                                .then(load)
                                .catch((x) => setErr(x instanceof Error ? x.message : "Could not assign."))
                            }
                            className={inputClass}
                          >
                            <option value="">Not assigned</option>
                            {gardens?.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (l.garden_name ?? "Not assigned")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <Report gardens={gardens ?? []} />
        </main>
      </div>

      {poster && (
        <div className="fixed inset-0 z-50 overflow-auto bg-white print:static">
          <div className="flex justify-end gap-2 p-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              onClick={() => setPoster(null)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>
          {/* printable-area: the site-wide print style prints only this (globals.css). */}
          <div className="printable-area mx-auto flex max-w-[180mm] flex-col items-center px-6 py-6 text-center">
            <p className="text-lg font-semibold uppercase tracking-wider text-slate-600">Munger Nagar Nigam</p>
            <h1 className="mt-2 text-5xl font-bold text-slate-900">{poster.name}</h1>
            {poster.name_hi && <p className="mt-1 text-3xl font-semibold text-slate-800">{poster.name_hi}</p>}
            <p className="mt-6 text-3xl font-semibold text-nnm-blue">Entry fee {rupees(poster.fee_per_person)} per person</p>
            <p className="text-2xl text-slate-700">प्रवेश शुल्क {rupees(poster.fee_per_person)} प्रति व्यक्ति</p>
            <div className="my-8 rounded-2xl border-4 border-slate-900 p-4">
              <QRCodeSVG value={poster.publicUrl} size={360} level="M" />
            </div>
            <p className="text-2xl font-semibold text-slate-900">Scan to buy your entry ticket</p>
            <p className="text-xl text-slate-700">टिकट के लिए स्कैन करें</p>
            <p className="mt-6 text-base text-slate-500">Or buy at the counter. Show the ticket&apos;s QR code at the gate.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Report({ gardens }: { gardens: Garden[] }) {
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [gardenId, setGardenId] = useState("");
  const [r, setR] = useState<GardenReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(() => {
    setErr(null);
    fetchGardenReport(from, to, gardenId ? Number(gardenId) : undefined)
      .then(setR)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, [from, to, gardenId]);
  useEffect(run, [run]);

  function csv() {
    if (!r) return;
    const rows = [
      ["Ticket no", "Garden", "Date", "Time", "Persons", "Fee", "Amount", "Payment", "POS ref", "Sold by", "Status", "Entry at"],
      ...r.tickets.map((t) => [
        t.ticketNo,
        t.gardenName,
        dmy(t.visitDate),
        t.issuedAtText.split(", ")[1] ?? "",
        t.persons,
        t.feePerPerson,
        t.amount,
        t.paymentModeLabel,
        t.posReference ?? "",
        t.soldBy ?? "Online",
        t.status,
        t.usedAtText ?? "",
      ]),
    ];
    const text = rows.map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `garden-tickets-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={card}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold text-slate-900">Collection report</h2>
        <label className="text-xs text-slate-600">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-slate-600">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-slate-600">
          Garden
          <select value={gardenId} onChange={(e) => setGardenId(e.target.value)} className={inputClass}>
            <option value="">All gardens</option>
            {gardens.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={csv}
          disabled={!r?.tickets.length}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download (Excel CSV)
        </button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {r && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Box label="Tickets" value={String(r.totals.tickets)} />
            <Box label="Persons" value={String(r.totals.persons)} />
            <Box label="Amount" value={rupees(r.totals.amount)} />
            <Box label="Entered (scanned / admitted)" value={String(r.totals.used)} />
            <Box label="Cancelled" value={String(r.cancelled)} />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Mini
              title="By payment"
              head={["Payment", "Tickets", "Persons", "Amount"]}
              rows={r.byMode.map((m) => [m.label, m.tickets, m.persons, rupees(m.amount)])}
            />
            <Mini
              title="By garden"
              head={["Garden", "Tickets", "Persons", "Amount"]}
              rows={r.byGarden.map((g) => [g.garden, g.tickets, g.persons, rupees(g.amount)])}
            />
            <Mini
              title="By day"
              head={["Date", "Tickets", "Persons", "Amount"]}
              rows={r.byDay.map((d) => [dmy(d.day), d.tickets, d.persons, rupees(d.amount)])}
            />
          </div>
          <Mini
            title="By counter (cash each counter should hand over)"
            head={["Counter", "Garden", "Tickets", "Persons", "Amount", "Cash"]}
            rows={r.bySeller.map((s) => [s.seller, s.garden, s.tickets, s.persons, rupees(s.amount), rupees(s.cash ?? 0)])}
          />
        </div>
      )}
    </section>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Mini({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                {head.map((h, i) => (
                  <th key={h} className={`py-1.5 pr-3 ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className={`py-1.5 pr-3 ${j > 0 && typeof c !== "string" ? "text-right" : j > 0 && head.length - j <= 2 ? "text-right" : ""}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
