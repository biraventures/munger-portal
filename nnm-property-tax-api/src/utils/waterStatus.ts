import { z } from "zod";

export const WATER_STATUSES = ["multiple", "single_wtp", "single_submersible", "connected_no_water", "none"] as const;
export type WaterStatus = (typeof WATER_STATUSES)[number];

/** Water supply status reported by the Tax Collector on a field visit - required; "multiple" needs the number. */
export const waterStatusFields = {
  waterConnectionStatus: z.enum(WATER_STATUSES, {
    errorMap: () => ({ message: "Select the holding's water supply status." }),
  }),
  waterConnectionCount: z.coerce.number().int().min(2).max(50).optional(),
};

export function checkWaterCount(d: { waterConnectionStatus?: string; waterConnectionCount?: number }): string | null {
  return d.waterConnectionStatus === "multiple" && d.waterConnectionCount === undefined ? "Enter how many water connections the holding has." : null;
}
