"use client";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

function yearOptions(): string[] {
  const now = new Date();
  const currentStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: string[] = [];
  for (let y = currentStart + 1; y >= 2000; y--) out.push(`${y}-${y + 1}`);
  return out;
}

/** "User charge paid till year": blank = unknown (the annual charge is then calculated from 2026-27 onwards). */
export function UserChargePaidTill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>User charge paid till year</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Unknown (charged from 2026-27)</option>
        {yearOptions().map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">The annual charge is collected for every year after this one.</p>
    </div>
  );
}
