"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Pencil, X } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";
import {
  fetchAttendanceWards,
  fetchFieldStaffNames,
  fetchFieldDriverNames,
  fetchFieldAssistantNames,
  updateFieldStaffNameHi,
  updateFieldDriverNameHi,
  updateFieldAssistantNameHi,
  type AttendanceWard,
  type NameCorrectionEntry,
} from "@/lib/attendance-api";

type Category = "staff" | "drivers" | "assistants";

const STRINGS = {
  en: {
    title: "Correct Hindi Names",
    subtitle:
      "The Hindi name shown here is a best-effort auto-guess from the English spelling. Fix any that are wrong - the correction is used from then on, everywhere that person's name is shown in Hindi.",
    staffTab: "Field Staff",
    driversTab: "Drivers",
    assistantsTab: "Assistants",
    loading: "Loading...",
    nameEn: "Name (English)",
    nameHi: "Name (Hindi)",
    ward: "Ward",
    autoGuess: "auto-guess",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    resetToAuto: "Reset to auto-guess",
    savedOk: "Saved.",
    couldNotLoad: "Could not load the list.",
    couldNotSave: "Could not save this correction.",
    noRecords: "No records found.",
  },
  hi: {
    title: "हिंदी नाम ठीक करें",
    subtitle:
      "यहाँ दिखाया गया हिंदी नाम अंग्रेज़ी स्पेलिंग से किया गया एक अनुमान है। जो भी गलत हो उसे ठीक करें - सुधार के बाद वही नाम हर जगह हिंदी में दिखाया जाएगा।",
    staffTab: "फील्ड स्टाफ",
    driversTab: "ड्राइवर",
    assistantsTab: "सहायक",
    loading: "लोड हो रहा है...",
    nameEn: "नाम (अंग्रेज़ी)",
    nameHi: "नाम (हिंदी)",
    ward: "वार्ड",
    autoGuess: "ऑटो-अनुमान",
    edit: "संपादित करें",
    save: "सहेजें",
    cancel: "रद्द करें",
    resetToAuto: "ऑटो-अनुमान पर वापस जाएँ",
    savedOk: "सहेज लिया गया।",
    couldNotLoad: "सूची लोड नहीं हो सकी।",
    couldNotSave: "यह सुधार सहेजा नहीं जा सका।",
    noRecords: "कोई रिकॉर्ड नहीं मिला।",
  },
};

export default function CorrectNamesPage() {
  const user = useAttendanceGuard(["attendance_admin", "sanitation_officer", "apswmo", "sanitation_prabhari"]);
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];

  const [category, setCategory] = useState<Category>("staff");
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [entries, setEntries] = useState<NameCorrectionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const wardNameById = useMemo(() => new Map(wards.map((w) => [w.id, w.wardName])), [wards]);

  async function loadCategory(cat: Category) {
    setEntries(null);
    setError(null);
    try {
      const list =
        cat === "staff"
          ? await fetchFieldStaffNames()
          : cat === "drivers"
            ? await fetchFieldDriverNames()
            : await fetchFieldAssistantNames();
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotLoad);
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadCategory(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, category]);

  function startEdit(entry: NameCorrectionEntry) {
    setEditingId(entry.id);
    setEditValue(entry.nameHi ?? transliterateName(entry.name));
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError(null);
  }

  async function saveEdit(entry: NameCorrectionEntry, value: string | null) {
    setSavingId(entry.id);
    setSaveError(null);
    try {
      const updater =
        category === "staff" ? updateFieldStaffNameHi : category === "drivers" ? updateFieldDriverNameHi : updateFieldAssistantNameHi;
      await updater(entry.id, value);
      setEntries((prev) => (prev ? prev.map((e) => (e.id === entry.id ? { ...e, nameHi: value } : e)) : prev));
      setEditingId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : s.couldNotSave);
    } finally {
      setSavingId(null);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;
  }

  const tabs: { key: Category; label: string }[] = [
    { key: "staff", label: s.staffTab },
    { key: "drivers", label: s.driversTab },
    { key: "assistants", label: s.assistantsTab },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{s.title}</h1>
        <p className="mb-6 text-sm text-slate-500">{s.subtitle}</p>

        <div className="mb-5 flex gap-1 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              className={`px-3 py-2 text-sm font-medium ${
                category === tab.key ? "border-b-2 border-nnm-blue text-nnm-blue" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!entries ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {s.loading}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">{s.noRecords}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">{s.nameEn}</th>
                  <th className="px-4 py-2.5">{s.ward}</th>
                  <th className="px-4 py-2.5">{s.nameHi}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const isEditing = editingId === entry.id;
                  const isSaving = savingId === entry.id;
                  const displayHi = entry.nameHi ?? transliterateName(entry.name);
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{entry.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{wardNameById.get(entry.wardId) ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                          />
                        ) : (
                          <span className={entry.nameHi ? "text-slate-900" : "text-slate-400"}>
                            {displayHi}
                            {!entry.nameHi && <span className="ml-1.5 text-[10px] uppercase tracking-wide">({s.autoGuess})</span>}
                          </span>
                        )}
                        {isEditing && saveError && <p className="mt-1 text-xs text-red-600">{saveError}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => saveEdit(entry, editValue.trim() || null)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                            >
                              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {s.save}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" />
                              {s.cancel}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => startEdit(entry)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {s.edit}
                            </button>
                            {entry.nameHi && (
                              <button
                                onClick={() => saveEdit(entry, null)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                {s.resetToAuto}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
