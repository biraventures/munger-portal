/** RFC 4180-style CSV field escaping - wraps in quotes and doubles any internal quotes, only when actually needed. */
export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(",");
}
