"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { fetchPropertySurveyList, recordPropertySurvey, type PropertySurveyListEntry } from "@/lib/operator-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function PropertySurveyPage() {
  const operator = useOperatorGuard();
  const [tab, setTab] = useState<"to_be_surveyed" | "surveyed">("to_be_surveyed");
  const [list, setList] = useState<PropertySurveyListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState<string | null>(null);
  const [surveyorName, setSurveyorName] = useState("");
  const [surveyorIdNumber, setSurveyorIdNumber] = useState("");
  const [surveyDate, setSurveyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setList(null);
    fetchPropertySurveyList(tab)
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the survey list."));
  }

  useEffect(() => {
    if (!operator) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator, tab]);

  function openRecord(holdingNo: string) {
    setRecording(holdingNo);
    setSurveyorName("");
    setSurveyorIdNumber("");
    setSurveyDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function handleRecordSubmit() {
    if (!recording) return;
    if (!surveyorName.trim() || !surveyorIdNumber.trim()) {
      setError("Surveyor name and ID number are both required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordPropertySurvey(recording, surveyorName.trim(), surveyorIdNumber.trim(), surveyDate);
      setRecording(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this survey.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardCheck className="h-6 w-6" />
          Property Survey Worklist
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Holdings added with only historical ARV values, pending a real physical survey before their area can be
          finalized.
        </p>

        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setTab("to_be_surveyed")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === "to_be_surveyed" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            To Be Surveyed
          </button>
          <button
            onClick={() => setTab("surveyed")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === "surveyed" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Surveyed - Awaiting Finalization
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!list ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            Nothing here right now.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {list.map((p) => (
              <div key={p.holding_no} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{p.holding_no}</p>
                    <p className="text-xs text-slate-500">
                      {p.owner_name} - {p.address}
                      {p.old_holding_no ? ` (old: ${p.old_holding_no})` : ""}
                    </p>
                    {tab === "surveyed" && (
                      <p className="mt-1 text-xs text-green-700">
                        Surveyed by {p.surveyor_name} (ID: {p.surveyor_id_number})
                        {p.survey_date ? ` on ${new Date(p.survey_date).toLocaleDateString("en-IN")}` : ""} - submit an area
                        change via the property editor to finalize.
                      </p>
                    )}
                  </div>
                  {tab === "to_be_surveyed" && (
                    <button
                      onClick={() => openRecord(p.holding_no)}
                      className="shrink-0 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                    >
                      Record Survey
                    </button>
                  )}
                </div>

                {recording === p.holding_no && (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Surveyor name</label>
                        <input value={surveyorName} onChange={(e) => setSurveyorName(e.target.value)} className={inputClass} autoFocus />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Surveyor ID number</label>
                        <input value={surveyorIdNumber} onChange={(e) => setSurveyorIdNumber(e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Survey date</label>
                        <input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRecordSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {submitting ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setRecording(null)}
                        disabled={submitting}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
