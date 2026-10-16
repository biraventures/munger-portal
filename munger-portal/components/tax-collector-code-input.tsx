"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { fetchActiveTaxCollectors } from "@/lib/tax-collector";

/**
 * Optional field on both the operator's counter-payment form and the
 * citizen-facing payment page — records which tax collector (field
 * agent), if any, facilitated a given payment. Was previously free
 * text with a debounced lookup to resolve it to a name; now a
 * dropdown listing every active collector's code and name together,
 * so there's nothing to mistype and nothing to guess - a code that
 * doesn't exist simply isn't a selectable option.
 */
export function TaxCollectorCodeInput({
  value,
  onChange,
  onCollectorChange,
  inputClassName,
  labelClassName,
}: {
  value: string;
  onChange: (code: string) => void;
  onCollectorChange?: (collector: { code: string; name: string } | null) => void;
  inputClassName: string;
  labelClassName: string;
}) {
  const [collectors, setCollectors] = useState<{ code: string; name: string }[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchActiveTaxCollectors()
      .then((list) => {
        setCollectors(list);
        if (value) {
          const match = list.find((c) => c.code === value) ?? null;
          onCollectorChange?.(match);
        }
      })
      .catch(() => setLoadError(true));
  }, [value, onCollectorChange]);

  return (
    <div>
      <label className={labelClassName}>Tax Collector (optional)</label>
      <select
        value={value}
        onChange={(e) => {
          const code = e.target.value;
          onChange(code);
          const match = collectors?.find((c) => c.code === code) ?? null;
          onCollectorChange?.(match);
        }}
        disabled={!collectors}
        className={inputClassName}
      >
        <option value="">Not applicable</option>
        {collectors?.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
      {!collectors && !loadError && <p className="mt-1 text-xs text-slate-400">Loading tax collectors…</p>}
      {loadError && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          Could not load the tax collector list right now.
        </p>
      )}
    </div>
  );
}
