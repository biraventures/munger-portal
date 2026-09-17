import type { FloorInput, PropertySaveInput } from "./propertySave.types";

export type HoldingEntryMode = "new" | "partiallyKnown";

export interface TaxHistoryStageEntryInput {
  periodOfAssessment: string;
  arvInPeriod: number;
}

/** Body for POST /api/v1/properties (no holdingNo in the path — one gets assigned). */
export interface NewEntryPropertyInput extends Omit<PropertySaveInput, "floors" | "changeBasis" | "changeReference"> {
  holdingEntryMode: HoldingEntryMode;
  /** Required (and only used) for 'new' mode — real floor surveys. */
  floors?: FloorInput[];
  /** Required (and only used) for 'partiallyKnown' mode — ARV per known historical phase. */
  taxHistoryStages?: TaxHistoryStageEntryInput[];
  /** partiallyKnown mode only - marks the holding survey_status = 'to_be_surveyed', since its area is only a back-calculated placeholder until a real survey happens. Meaningless (ignored) for 'new' mode, since that already requires real floors. */
  markForSurvey?: boolean;
}