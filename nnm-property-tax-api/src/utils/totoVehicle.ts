/**
 * "Toto" e-rickshaws are a distinct fleet category from the other vehicle
 * types (JCB, Dumper, Robot, Sweeping Machine, etc.) but there is no
 * structured column distinguishing them - see migration 028 and
 * vehicleStaffImport.service.ts. They are identified purely by their
 * asset label, e.g. "Toto-1", "Toto-12". This is the single shared place
 * that decides what counts as a Toto vehicle, so every place that needs
 * to tell Toto and non-Toto vehicles apart (attendance access control,
 * reporting, etc.) stays consistent.
 */
export function isTotoLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /^toto/i.test(label.trim());
}
