import { pool } from "../config/db";
import type { PoolClient } from "pg";

export interface AssetBaselineSurveyRow {
  id: number;
  asset_id: number;
  survey_date: string;
  surveyed_by: string;
  component_condition: Record<string, number>;
  overall_status: string | null;
  safety_status: string | null;
  administrative_disposition: string | null;
  amc_disposition: string | null;
  deployment_status: string | null;
  utilisation_data: Record<string, unknown>;
  utilisation_data_source: string | null;
  notes: string | null;
  created_at: string;
}

export interface AssetDefectRow {
  id: number;
  asset_id: number;
  survey_id: number | null;
  component: string;
  sub_component: string | null;
  description: string;
  severity: string;
  safety_critical: boolean;
  operational_despite_defect: boolean;
  repair_priority: string | null;
  recommended_action: string | null;
  spare_part_required: string | null;
  estimated_repair_cost: string | null;
  estimated_downtime: string | null;
  repair_required_before_deployment: boolean;
  repair_status: string;
  logged_by: string;
  logged_at: string;
  resolved_at: string | null;
  resolved_notes: string | null;
}

export interface AssetSurveySummaryRow {
  id: number;
  label: string;
  asset_category: string | null;
  asset_type_detail: string | null;
  registration_number: string | null;
  present_location_yard: string | null;
  survey_id: number | null;
  survey_date: string | null;
  surveyed_by: string | null;
  overall_status: string | null;
  safety_status: string | null;
  amc_disposition: string | null;
  deployment_status: string | null;
  open_defect_count: string;
  driver_name: string | null;
}

export const assetBaselineSurveyRepository = {
  /**
   * Every asset with its most recent survey's key fields (or nulls if
   * never surveyed) and a count of currently-open defects - the
   * fleet-wide progress view, so oversight roles can see at a glance
   * which assets still need a baseline survey done and which are
   * flagged for attention.
   */
  async listSurveySummaries(): Promise<AssetSurveySummaryRow[]> {
    const { rows } = await pool.query<AssetSurveySummaryRow>(
      `SELECT
         a.id, a.label, a.asset_category, a.asset_type_detail, a.registration_number, a.present_location_yard,
         s.id AS survey_id, s.survey_date, s.surveyed_by, s.overall_status, s.safety_status, s.amc_disposition, s.deployment_status,
         COALESCE(d.open_count, 0) AS open_defect_count,
         drv.driver_name
       FROM assets a
       LEFT JOIN LATERAL (
         SELECT id, survey_date, surveyed_by, overall_status, safety_status, amc_disposition, deployment_status
         FROM asset_baseline_surveys
         WHERE asset_baseline_surveys.asset_id = a.id
         ORDER BY survey_date DESC, id DESC LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS open_count FROM asset_defects
         WHERE asset_defects.asset_id = a.id AND repair_status IN ('open', 'in_progress')
       ) d ON true
       LEFT JOIN LATERAL (
         -- Comma-joined since more than one driver (e.g. separate
         -- morning/afternoon shift drivers) can be tagged to the same
         -- vehicle - see fieldDriver.repository.ts's
         -- driverNamesByAssetIds() for the equivalent app-side lookup.
         SELECT string_agg(name, ', ' ORDER BY name) AS driver_name
         FROM field_drivers
         WHERE field_drivers.asset_id = a.id AND field_drivers.active = TRUE
       ) drv ON true
       WHERE a.active = TRUE
       ORDER BY a.label ASC`,
    );
    return rows;
  },

  async createSurvey(input: {
    assetId: number;
    surveyedBy: string;
    componentCondition: Record<string, number>;
    overallStatus: string | null;
    safetyStatus: string | null;
    administrativeDisposition: string | null;
    amcDisposition: string | null;
    deploymentStatus: string | null;
    utilisationData: Record<string, unknown>;
    utilisationDataSource: string | null;
    notes: string | null;
  }, client?: PoolClient): Promise<AssetBaselineSurveyRow> {
    const { rows } = await (client ?? pool).query<AssetBaselineSurveyRow>(
      `INSERT INTO asset_baseline_surveys (
        asset_id, surveyed_by, component_condition, overall_status, safety_status,
        administrative_disposition, amc_disposition, deployment_status, utilisation_data, utilisation_data_source, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        input.assetId,
        input.surveyedBy,
        JSON.stringify(input.componentCondition),
        input.overallStatus,
        input.safetyStatus,
        input.administrativeDisposition,
        input.amcDisposition,
        input.deploymentStatus,
        JSON.stringify(input.utilisationData),
        input.utilisationDataSource,
        input.notes,
      ],
    );
    return rows[0]!;
  },

  /** Every survey ever done for an asset, most recent first - the most recent is the asset's current standing. */
  async listSurveysForAsset(assetId: number): Promise<AssetBaselineSurveyRow[]> {
    const { rows } = await pool.query<AssetBaselineSurveyRow>(
      `SELECT * FROM asset_baseline_surveys WHERE asset_id = $1 ORDER BY survey_date DESC, id DESC`,
      [assetId],
    );
    return rows;
  },

  async findLatestSurveyForAsset(assetId: number): Promise<AssetBaselineSurveyRow | null> {
    const { rows } = await pool.query<AssetBaselineSurveyRow>(
      `SELECT * FROM asset_baseline_surveys WHERE asset_id = $1 ORDER BY survey_date DESC, id DESC LIMIT 1`,
      [assetId],
    );
    return rows[0] ?? null;
  },

  async createDefect(input: {
    assetId: number;
    surveyId: number | null;
    component: string;
    subComponent: string | null;
    description: string;
    severity: string;
    safetyCritical: boolean;
    operationalDespiteDefect: boolean;
    repairPriority: string | null;
    recommendedAction: string | null;
    sparePartRequired: string | null;
    estimatedRepairCost: number | null;
    estimatedDowntime: string | null;
    repairRequiredBeforeDeployment: boolean;
    loggedBy: string;
  }, client?: PoolClient): Promise<AssetDefectRow> {
    const { rows } = await (client ?? pool).query<AssetDefectRow>(
      `INSERT INTO asset_defects (
        asset_id, survey_id, component, sub_component, description, severity, safety_critical,
        operational_despite_defect, repair_priority, recommended_action, spare_part_required,
        estimated_repair_cost, estimated_downtime, repair_required_before_deployment, logged_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        input.assetId,
        input.surveyId,
        input.component,
        input.subComponent,
        input.description,
        input.severity,
        input.safetyCritical,
        input.operationalDespiteDefect,
        input.repairPriority,
        input.recommendedAction,
        input.sparePartRequired,
        input.estimatedRepairCost,
        input.estimatedDowntime,
        input.repairRequiredBeforeDeployment,
        input.loggedBy,
      ],
    );
    return rows[0]!;
  },

  async listDefectsForAsset(assetId: number, openOnly = false): Promise<AssetDefectRow[]> {
    const where = openOnly ? `AND repair_status IN ('open', 'in_progress')` : "";
    const { rows } = await pool.query<AssetDefectRow>(
      `SELECT * FROM asset_defects WHERE asset_id = $1 ${where} ORDER BY logged_at DESC`,
      [assetId],
    );
    return rows;
  },

  async updateDefectStatus(id: number, status: string, resolvedNotes: string | null): Promise<AssetDefectRow | null> {
    const resolvedAt = status === "resolved" ? "now()" : "NULL";
    const { rows } = await pool.query<AssetDefectRow>(
      `UPDATE asset_defects SET repair_status = $2, resolved_notes = $3, resolved_at = ${resolvedAt} WHERE id = $1 RETURNING *`,
      [id, status, resolvedNotes],
    );
    return rows[0] ?? null;
  },
};
