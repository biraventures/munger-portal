"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import {
  approveRequest,
  assignRequest,
  darogaForward,
  dmcForward,
  fetchStaffRequest,
  fyOptions,
  openRequestDocument,
  rejectRequest,
  returnRequest,
  ROAD_TYPES,
  sendBackToDaroga,
  submitFieldReport,
  WARDS,
  type FloorInput,
  type StaffDetail,
} from "@/lib/new-holding-api";
import { formatDuration } from "@/lib/mutation-api";
import { FLOOR_LABELS, nextFloorLabel } from "@/components/new-holding/request-form";
import { blankFieldReport, FieldReportForm, FieldReportList, fieldReportBody, SurveyorSelect, type FieldReportDraft } from "@/components/admin/field-report";

const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const lbl = "mb-1 block text-xs font-medium text-slate-600";
const box = "space-y-3 rounded-lg border p-3";

function fmt(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
}

const floorName = (v: string) => FLOOR_LABELS.find((l) => l.value === v)?.label ?? v;

/** A best guess for the solid waste user charge type from the floors' uses; the Tax Daroga confirms it. */
function suggestSolidWaste(floors: FloorInput[]): string {
  const uses = new Set(floors.map((f) => f.usageType));
  if (uses.size === 1 && uses.has("Residential")) return "Residential House";
  if ([...uses].some((u) => u.startsWith("shops"))) return "Shop";
  return "";
}

interface Correction {
  ward: string;
  address: string;
  plotAreaSqft: string;
  roadType: "PMR" | "MR" | "OR";
  constructionYear: string;
  floors: (Omit<FloorInput, "buildupSqft"> & { buildupSqft: string; key: number })[];
}

function FloorsTable({ floors, constructionYear }: { floors: FloorInput[]; constructionYear: string }) {
  const total = floors.reduce((s, f) => s + Number(f.buildupSqft), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="p-1.5">Floor</th>
            <th className="p-1.5">Built-up (sq ft)</th>
            <th className="p-1.5">Construction</th>
            <th className="p-1.5">Use</th>
            <th className="p-1.5">Occupancy</th>
            <th className="p-1.5">Built</th>
          </tr>
        </thead>
        <tbody>
          {floors.map((f, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="p-1.5">{floorName(f.floorLabel)}</td>
              <td className="p-1.5">{Number(f.buildupSqft).toLocaleString("en-IN")}</td>
              <td className="p-1.5">{f.constType}</td>
              <td className="p-1.5">{f.usageType}</td>
              <td className="p-1.5">{f.occupancy}</td>
              <td className="p-1.5">{f.yearBuilt ?? constructionYear}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-semibold">
            <td className="p-1.5">Total</td>
            <td className="p-1.5">{total.toLocaleString("en-IN")}</td>
            <td colSpan={4} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** One request on the desk: details, documents, possible existing holdings, field report, audit trail, and the action for this login. */
export function NewHoldingRequestPanel({
  requestId,
  role,
  usageTypes,
  solidWasteTypes,
  onChanged,
}: {
  requestId: string;
  role: string;
  usageTypes: string[];
  solidWasteTypes: string[];
  onChanged: (message?: string) => void;
}) {
  const [d, setD] = useState<StaffDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [existingHolding, setExistingHolding] = useState("");
  const [oldNo, setOldNo] = useState("");
  const [surveyor, setSurveyor] = useState("");
  const [report, setReport] = useState<FieldReportDraft>(blankFieldReport);
  const [comments, setComments] = useState("");
  const [swType, setSwType] = useState("");
  const [isSlum, setIsSlum] = useState(false);
  const [correct, setCorrect] = useState<Correction | null>(null);

  function load() {
    fetchStaffRequest(requestId)
      .then((x) => {
        setD(x);
        const v = x.request.verified_details;
        setSwType((cur) => cur || v?.solidWasteChargeType || suggestSolidWaste(x.request.floors));
        if (v?.isSlum) setIsSlum(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the request."));
  }
  useEffect(load, [requestId]);

  if (error && !d) return <p className="text-sm text-red-600">{error}</p>;
  if (!d) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  const r = d.request;
  const v = r.verified_details;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const message = await fn();
      setRemarks("");
      setComments("");
      load();
      onChanged(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function startCorrecting() {
    setCorrect({
      ward: v?.ward ?? r.ward,
      address: v?.address ?? r.address,
      plotAreaSqft: String(Number(v?.plotAreaSqft ?? r.plot_area_sqft)),
      roadType: v?.roadType ?? r.road_type,
      constructionYear: v?.constructionYear ?? r.construction_year,
      floors: (v?.floors ?? r.floors).map((f, i) => ({ ...f, buildupSqft: String(f.buildupSqft), key: i })),
    });
  }

  const row = (label: string, value: React.ReactNode) => (
    <div>
      <span className="text-slate-500">{label}:</span> <span className="text-slate-900">{value || "-"}</span>
    </div>
  );
  const gps = r.latitude && r.longitude ? `${Number(r.latitude).toFixed(6)}, ${Number(r.longitude).toFixed(6)}` : null;
  const isDaroga = role === "tax_daroga";

  // --- the action block for this login at this step ------------------------------------------------------------------
  const rejectBlock = (canReturnToApplicant: boolean, canSendBackToDaroga: boolean) => (
    <div className={`${box} border-slate-200 bg-slate-50`}>
      <div>
        <label className={lbl}>
          Remarks{canReturnToApplicant ? " (shown to the applicant when sent back / not accepted)" : ""}
        </label>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} className={inp} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>If it already has a holding: that holding number (optional)</label>
          <input value={existingHolding} onChange={(e) => setExistingHolding(e.target.value)} maxLength={32} className={inp} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canReturnToApplicant && (
            <button
              onClick={() =>
                run(async () => {
                  await returnRequest(r.id, remarks.trim());
                  return `${r.application_no} sent back to the applicant.`;
                })
              }
              disabled={busy || remarks.trim().length < 3}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-60"
            >
              Send back to applicant
            </button>
          )}
          {canSendBackToDaroga && (
            <button
              onClick={() =>
                run(async () => {
                  await sendBackToDaroga(r.id, remarks.trim());
                  return `${r.application_no} sent back to the Tax Daroga.`;
                })
              }
              disabled={busy || remarks.trim().length < 3}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-60"
            >
              Send back to Tax Daroga
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm("Turn this request down? The applicant will see the remarks."))
                run(async () => {
                  await rejectRequest(r.id, remarks.trim(), existingHolding.trim() || null);
                  return `${r.application_no} not accepted.`;
                });
            }}
            disabled={busy || remarks.trim().length < 3}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
          >
            Not accept
          </button>
        </div>
      </div>
    </div>
  );

  let action: React.ReactNode = null;
  if (isDaroga && r.status === "submitted") {
    action = (
      <>
        <div className={`${box} border-green-200 bg-green-50/50`}>
          <p className="font-medium text-slate-800">No holding exists - entered in the demand register: give the old holding no. and send for field verification</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={lbl}>Old holding no. given in the demand register</label>
              <input value={oldNo} onChange={(e) => setOldNo(e.target.value)} maxLength={32} className={inp} />
            </div>
            <div>
              <label className={lbl}>Tax Surveyor for the field report</label>
              <SurveyorSelect value={surveyor} onChange={setSurveyor} className={inp} />
            </div>
            <div>
              <label className={lbl}>Remarks (optional)</label>
              <input value={comments} onChange={(e) => setComments(e.target.value)} maxLength={500} className={inp} />
            </div>
          </div>
          <button
            onClick={() => {
              if (!oldNo.trim()) return setError("Enter the old holding number given in the demand register.");
              if (!surveyor) return setError("Choose the Tax Surveyor.");
              run(async () => {
                await assignRequest(r.id, { registerOldHoldingNo: oldNo.trim(), surveyorUsername: surveyor, remarks: comments.trim() || null });
                return `${r.application_no}: old holding no. ${oldNo.trim().toUpperCase()} recorded; sent to the Tax Surveyor.`;
              });
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send for field verification
          </button>
        </div>
        {rejectBlock(true, false)}
      </>
    );
  } else if (role === "tax_surveyor" && r.status === "at_surveyor") {
    action = (
      <div>
        <FieldReportForm value={report} onChange={setReport} onError={setError} />
        <button
          onClick={() => {
            const b = fieldReportBody(report);
            if (typeof b === "string") return setError(b);
            run(async () => {
              await submitFieldReport(r.id, b);
              setReport(blankFieldReport());
              return `${r.application_no}: field report submitted to the Tax Daroga.`;
            });
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Submit field report
        </button>
      </div>
    );
  } else if (isDaroga && r.status === "daroga_review") {
    action = (
      <>
        <div className={`${box} border-green-200 bg-green-50/50`}>
          <p className="font-medium text-slate-800">Your comments after the field report - forward to the DMC</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={lbl}>Solid waste user charge type</label>
              <select value={swType} onChange={(e) => setSwType(e.target.value)} className={inp}>
                <option value="">Select</option>
                {solidWasteTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={isSlum} onChange={(e) => setIsSlum(e.target.checked)} />
              In a notified slum
            </label>
          </div>
          {!correct ? (
            <button onClick={startCorrecting} className="text-xs font-semibold text-nnm-blue hover:underline">
              Correct the property details as found in the field verification
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Details as verified (used for the holding)</span>
                <button onClick={() => setCorrect(null)} className="text-xs text-slate-500 hover:underline">
                  Use the applicant&apos;s details
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className={lbl}>Ward</label>
                  <select value={correct.ward} onChange={(e) => setCorrect({ ...correct, ward: e.target.value })} className={inp}>
                    {WARDS.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Plot area (sq ft)</label>
                  <input type="number" value={correct.plotAreaSqft} onChange={(e) => setCorrect({ ...correct, plotAreaSqft: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Road</label>
                  <select value={correct.roadType} onChange={(e) => setCorrect({ ...correct, roadType: e.target.value as Correction["roadType"] })} className={inp}>
                    {ROAD_TYPES.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Year of construction</label>
                  <select value={correct.constructionYear} onChange={(e) => setCorrect({ ...correct, constructionYear: e.target.value })} className={inp}>
                    {fyOptions(1950).map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className={lbl}>Address</label>
                  <input value={correct.address} onChange={(e) => setCorrect({ ...correct, address: e.target.value })} maxLength={500} className={inp} />
                </div>
              </div>
              {correct.floors.map((f) => {
                const set = (patch: Partial<Correction["floors"][number]>) => setCorrect({ ...correct, floors: correct.floors.map((x) => (x.key === f.key ? { ...x, ...patch } : x)) });
                return (
                  <div key={f.key} className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-7">
                    <select value={f.floorLabel} onChange={(e) => set({ floorLabel: e.target.value })} className={inp}>
                      {FLOOR_LABELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <input type="number" value={f.buildupSqft} onChange={(e) => set({ buildupSqft: e.target.value })} placeholder="sq ft" className={inp} />
                    <select value={f.constType} onChange={(e) => set({ constType: e.target.value as FloorInput["constType"] })} className={inp}>
                      <option>RCC</option>
                      <option>Asbestos</option>
                      <option>Other</option>
                    </select>
                    <select value={f.usageType} onChange={(e) => set({ usageType: e.target.value })} className={`${inp} sm:col-span-2`}>
                      {usageTypes.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <select value={f.occupancy} onChange={(e) => set({ occupancy: e.target.value as FloorInput["occupancy"] })} className={inp}>
                      <option value="self">self</option>
                      <option value="rented">rented</option>
                    </select>
                    <div className="flex gap-1">
                      <select value={f.yearBuilt ?? ""} onChange={(e) => set({ yearBuilt: e.target.value || null })} className={inp}>
                        <option value="">Same</option>
                        {fyOptions(1950).map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </select>
                      {correct.floors.length > 1 && (
                        <button onClick={() => setCorrect({ ...correct, floors: correct.floors.filter((x) => x.key !== f.key) })} className="text-red-500" aria-label="Remove floor">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() =>
                  setCorrect({
                    ...correct,
                    floors: [
                      ...correct.floors,
                      { floorLabel: nextFloorLabel(correct.floors.map((x) => x.floorLabel)), buildupSqft: "", constType: "RCC", usageType: usageTypes[0] ?? "Residential", occupancy: "self", yearBuilt: null, key: Date.now() },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
              >
                <Plus className="h-3.5 w-3.5" /> Add a floor
              </button>
            </div>
          )}
          <div>
            <label className={lbl}>Your comments (required)</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} maxLength={500} className={inp} />
          </div>
          <button
            onClick={() => {
              if (!swType) return setError("Choose the solid waste user charge type.");
              if (comments.trim().length < 3) return setError("Write your comments.");
              run(async () => {
                await darogaForward(r.id, {
                  remarks: comments.trim(),
                  solidWasteChargeType: swType,
                  isSlum,
                  ...(correct
                    ? {
                        ward: correct.ward,
                        address: correct.address,
                        plotAreaSqft: Number(correct.plotAreaSqft),
                        roadType: correct.roadType,
                        constructionYear: correct.constructionYear,
                        floors: correct.floors.map((f) => ({
                          floorLabel: f.floorLabel,
                          constType: f.constType,
                          usageType: f.usageType,
                          occupancy: f.occupancy,
                          buildupSqft: Number(f.buildupSqft),
                          yearBuilt: f.yearBuilt || null,
                        })),
                      }
                    : {}),
                });
                return `${r.application_no} forwarded to the DMC.`;
              });
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Forward to DMC
          </button>
        </div>
        {rejectBlock(true, false)}
      </>
    );
  } else if (role === "deputy_commissioner" && r.status === "at_dmc") {
    action = (
      <>
        <div className={`${box} border-green-200 bg-green-50/50`}>
          <label className={lbl}>Your comments (required)</label>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} maxLength={500} className={inp} />
          <button
            onClick={() => {
              if (comments.trim().length < 3) return setError("Write your comments.");
              run(async () => {
                await dmcForward(r.id, comments.trim());
                return `${r.application_no} forwarded to the Commissioner.`;
              });
            }}
            disabled={busy}
            className="rounded-md bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            Forward to Commissioner
          </button>
        </div>
        {rejectBlock(false, true)}
      </>
    );
  } else if (role === "commissioner" && r.status === "at_commissioner") {
    action = (
      <>
        <div className={`${box} border-green-200 bg-green-50/50`}>
          <p className="text-slate-700">
            Approving creates the holding with the next MMC- number, old holding no. <b className="font-mono">{r.register_old_holding_no}</b> (demand register),
            user charge type <b>{v?.solidWasteChargeType ?? "-"}</b>. Tax will be due from {v?.constructionYear ?? r.construction_year}.
          </p>
          <label className={lbl}>Remarks (optional)</label>
          <input value={comments} onChange={(e) => setComments(e.target.value)} maxLength={500} className={inp} />
          <button
            onClick={() => {
              if (!window.confirm(`Approve and create the holding for ${r.owner_name}?`)) return;
              run(async () => {
                const x = await approveRequest(r.id, comments.trim() || null);
                return `${r.application_no}: approved - holding ${x.holdingNo} created for ${r.owner_name}.`;
              });
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Approve &amp; create holding
          </button>
        </div>
        {rejectBlock(false, true)}
      </>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {row("Application no", <b className="font-mono">{r.application_no}</b>)}
        {row("Submitted", fmt(r.submitted_at))}
        {row("Owner", `${r.owner_name}${r.relation_type ? ` ${r.relation_type} ${r.relation_name ?? ""}` : ""}`)}
        {row("Owner's mobile / Aadhaar", `${r.owner_mobile} / ${r.owner_aadhaar}`)}
        {row("Owner's email", r.owner_email)}
        {row("Applicant", `${r.applicant_name} (${r.applicant_mobile})`)}
        {row("Address", `${r.address}${r.landmark ? ` (near ${r.landmark})` : ""}${r.pincode ? ` - ${r.pincode}` : ""}`)}
        {row("Ward", r.ward)}
        {row("Ownership", r.ownership_basis_label)}
        {row("Land record", `Khata ${r.khata_no ?? "-"}, Khesra ${r.khesra_no ?? "-"}, Sheet ${r.survey_sheet_no ?? "-"}, Survey ward ${r.survey_ward ?? "-"}`)}
        {row("Plot area", `${Number(r.plot_area_sqft).toLocaleString("en-IN")} sq ft`)}
        {row("Road", ROAD_TYPES.find((x) => x.value === r.road_type)?.label)}
        {row("Year of construction", r.construction_year)}
        {row("Rain water harvesting", r.rain_water_harvesting ? "Yes" : "No")}
        {row(
          "GPS at property",
          gps ? (
            <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="text-nnm-blue hover:underline">
              {gps}
              {r.gps_accuracy_m ? ` (±${Math.round(Number(r.gps_accuracy_m))} m)` : ""}
            </a>
          ) : null,
        )}
        {r.edit_count > 0 && row("Corrected by applicant", `${r.edit_count} time(s), last ${fmt(r.last_edited_at)}`)}
        {r.register_old_holding_no && row("Old holding no. (demand register)", <b className="font-mono">{r.register_old_holding_no}</b>)}
        {r.assigned_surveyor_name && row("Tax Surveyor", r.assigned_surveyor_name)}
        {r.new_holding_no && row("Holding created", <b className="font-mono text-green-700">{r.new_holding_no}</b>)}
      </div>

      <FloorsTable floors={r.floors} constructionYear={r.construction_year} />

      {v && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <b>Tax Daroga&apos;s verified details:</b> user charge {v.solidWasteChargeType ?? "-"}
          {v.isSlum ? ", notified slum" : ""}
          {v.ward ? `; ward ${v.ward}` : ""}
          {v.plotAreaSqft ? `; plot ${v.plotAreaSqft} sq ft` : ""}
          {v.roadType ? `; road ${v.roadType}` : ""}
          {v.constructionYear ? `; built ${v.constructionYear}` : ""}
          {v.address ? `; address ${v.address}` : ""}
          {v.floors && (
            <div className="mt-2">
              <FloorsTable floors={v.floors} constructionYear={v.constructionYear ?? r.construction_year} />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 font-medium text-slate-700">Documents &amp; photos</div>
        <div className="flex flex-wrap gap-2">
          {d.documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => openRequestDocument(r.id, doc.id).catch((err) => setError(err instanceof Error ? err.message : "Could not open the document."))}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title={doc.file_name}
            >
              <FileText className="h-3.5 w-3.5" />
              {doc.label.split(" (")[0]}
            </button>
          ))}
        </div>
      </div>

      {role !== "tax_surveyor" && (
        <div className={`rounded-lg border p-3 ${d.matches.holdings.length || d.matches.requests.length ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-800">
            {(d.matches.holdings.length > 0 || d.matches.requests.length > 0) && <AlertTriangle className="h-4 w-4 text-amber-600" />}
            Does a holding already exist?
          </div>
          {d.matches.holdings.length === 0 && d.matches.requests.length === 0 ? (
            <p className="text-xs text-slate-600">No holding on record has the same Aadhaar, mobile, khata + khesra, or owner name in this ward. Still check the demand register.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {d.matches.holdings.map((h) => (
                <li key={h.holding_no}>
                  <b className="font-mono">{h.holding_no}</b>
                  {h.old_holding_no ? ` (old ${h.old_holding_no})` : ""} · {h.owner_name} · ward {h.ward ?? "-"} · {h.address} · {Number(h.area_sqft)} sq ft{" "}
                  <span className="font-semibold text-amber-800">[{h.reasons.join(", ")}]</span>
                </li>
              ))}
              {d.matches.requests.map((q) => (
                <li key={q.id}>
                  Another request <b className="font-mono">{q.application_no}</b> · {q.owner_name} · ward {q.ward} · {q.status}
                  {q.new_holding_no ? ` → ${q.new_holding_no}` : ""} <span className="font-semibold text-amber-800">[same Aadhaar or khata + khesra]</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <FieldReportList reports={d.fieldReports} />

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Audit trail</p>
        <ol className="space-y-1 text-xs">
          {d.events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-slate-500">{fmt(e.at)}</span>
              <span>
                <b>{e.label}</b> · {e.actor}
                {e.minutesAtDesk !== null && e.minutesAtDesk !== undefined && <span className="text-slate-400"> (after {formatDuration(e.minutesAtDesk)} at the desk)</span>}
                {e.remarks && <span className="text-slate-600"> — “{e.remarks}”</span>}
                {e.event === "applicant_edited" && Array.isArray((e.details as { changed?: string[] } | null)?.changed) && (
                  <span className="text-slate-500"> ({((e.details as { changed: string[] }).changed).join(", ")})</span>
                )}
                {e.event === "assigned" && e.details && (
                  <span className="text-slate-500">
                    {" "}
                    (old holding no. {String(e.details.registerOldHoldingNo)}; surveyor {String(e.details.surveyor)})
                  </span>
                )}
                {e.event === "created" && e.details && <span className="text-slate-500"> ({String(e.details.holdingNo)})</span>}
              </span>
            </li>
          ))}
        </ol>
        {d.deskTimes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2 text-xs">
            {d.deskTimes.map((t) => (
              <span key={t.desk} className={`rounded-full px-2 py-0.5 ${t.ongoing ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                {t.label}: {formatDuration(t.minutes)}
                {t.ongoing ? " (now)" : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {r.status === "rejected" && (
        <p className="text-slate-700">
          Not accepted{r.duplicate_of_holding ? ` - already holding ${r.duplicate_of_holding}` : ""}: {r.handling_remarks}
        </p>
      )}

      {action && <div className="space-y-3">{action}</div>}
    </div>
  );
}
