export type CollectionIssueType =
  | "refused_to_pay"
  | "disputes_tax_amount"
  | "disputes_solid_waste_amount"
  | "absent_door_locked"
  | "under_construction"
  | "disputes_measurement";

export const COLLECTION_ISSUE_TYPE_LABELS: Record<CollectionIssueType, string> = {
  refused_to_pay: "Taxpayer refused to pay",
  disputes_tax_amount: "Taxpayer disputes the tax amount",
  disputes_solid_waste_amount: "Taxpayer disputes the solid waste user charge amount",
  absent_door_locked: "Taxpayer absent / door locked",
  under_construction: "Building under construction",
  disputes_measurement: "Taxpayer disputes the measurement details",
};

export interface CollectionIssueRow {
  id: number;
  holding_no: string;
  issue_type: CollectionIssueType;
  notes: string | null;
  reported_by_username: string;
  reported_by_display_name: string;
  reported_at: Date;
}
