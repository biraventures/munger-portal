import PDFDocument from "pdfkit";
import type { AssetRow } from "../repositories/asset.repository";
import type { AssetBaselineSurveyRow, AssetDefectRow } from "../repositories/assetBaselineSurvey.repository";
import { getTechnicalModulesForAssetType, CONDITION_COMPONENT_GROUPS, CONDITION_SCALE, AMC_DISPOSITION_OPTIONS } from "../constants/fleetAssetRegistry";

/**
 * Renders a completed baseline survey as a compact PDF - the asset's
 * identification/technical fields plus its latest survey (condition,
 * status, utilisation) and open defects. Built for a physical
 * signed-and-filed record, so:
 *  - every section skips fields with no value, and a section with
 *    nothing filled in is omitted entirely rather than shown empty;
 *  - a dense two-column label/value grid rather than one field per
 *    line, to keep this to as few printed pages as possible;
 *  - the surveying engineer's name and a signature line are the last
 *    thing on the page, for physical sign-off.
 *
 * technical_data and component_condition are both free-form JSONB
 * keyed by machine-readable field keys - fleetAssetRegistry.ts is the
 * single source of truth for turning those keys into the labels a
 * human filled in on the survey form, so this reuses it rather than
 * re-deriving labels.
 */
export function generateBaselineSurveyPdf(asset: AssetRow, survey: AssetBaselineSurveyRow, defects: AssetDefectRow[]): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 40, left: 40, right: 40 } });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colGap = 16;
  const colWidth = (pageWidth - colGap) / 2;

  type Field = [label: string, value: unknown, unit?: string];

  /** Drops anything with no meaningful value - null/undefined, an empty string, or an empty/whitespace-only string. */
  function hasValue(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "boolean") return true;
    return true;
  }

  /** node-postgres parses DATE columns into JS Date objects, whose default toString() is long and includes a timezone - this renders a clean "15 Sep 2026" instead. */
  function formatDate(v: unknown): string {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  function formatValue(v: unknown, unit?: string): string {
    let s: string;
    if (typeof v === "boolean") s = v ? "Yes" : "No";
    else if (v instanceof Date) s = formatDate(v);
    else s = String(v);
    return unit ? `${s} ${unit}` : s;
  }

  let cursorY = doc.y;

  function ensureSpace(height: number) {
    if (cursorY + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      cursorY = doc.y;
    }
  }

  function sectionHeading(title: string) {
    ensureSpace(20);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#1a3d6d").text(title, doc.page.margins.left, cursorY, { width: pageWidth });
    cursorY = doc.y + 2;
    doc
      .moveTo(doc.page.margins.left, cursorY)
      .lineTo(doc.page.margins.left + pageWidth, cursorY)
      .strokeColor("#1a3d6d")
      .lineWidth(0.75)
      .stroke();
    cursorY += 6;
    doc.fillColor("#000000");
  }

  /** Renders a section's fields in a dense two-column grid, skipping any field with no value and the whole section if nothing remains. Returns whether anything was rendered. */
  function renderFieldGrid(title: string, fields: Field[]): boolean {
    const present = fields.filter(([, v]) => hasValue(v));
    if (present.length === 0) return false;

    sectionHeading(title);
    doc.font("Helvetica").fontSize(8.5).fillColor("#000000");

    for (let i = 0; i < present.length; i += 2) {
      const rowHeight = 13;
      ensureSpace(rowHeight);
      const [label1, value1, unit1] = present[i]!;
      doc.font("Helvetica-Bold").text(`${label1}: `, doc.page.margins.left, cursorY, { continued: true, width: colWidth });
      doc.font("Helvetica").text(formatValue(value1, unit1), { width: colWidth });

      if (present[i + 1]) {
        const [label2, value2, unit2] = present[i + 1]!;
        const col2X = doc.page.margins.left + colWidth + colGap;
        doc.font("Helvetica-Bold").text(`${label2}: `, col2X, cursorY, { continued: true, width: colWidth });
        doc.font("Helvetica").text(formatValue(value2, unit2), { width: colWidth });
      }
      cursorY += rowHeight;
    }
    cursorY += 6;
    return true;
  }

  // -----------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a3d6d").text("Fleet Baseline Survey Report", { align: "center" });
  doc.moveDown(0.2);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#000000")
    .text(`${asset.label}${asset.registration_number ? ` (${asset.registration_number})` : ""}`, { align: "center" });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#555555")
    .text(`Survey date: ${formatDate(survey.survey_date)}`, { align: "center" });
  doc.moveDown(0.5);
  cursorY = doc.y;

  // -----------------------------------------------------------------
  // Identification & Ownership
  // -----------------------------------------------------------------
  renderFieldGrid("Identification & Ownership", [
    ["Asset category", asset.asset_category],
    ["Asset type", asset.asset_type_detail],
    ["Excavator class", asset.excavator_class],
    ["Registration number", asset.registration_number],
    ["Engine number", asset.engine_number],
    ["Manufacturer", asset.manufacturer],
    ["Model", asset.model],
    ["Variant", asset.variant],
    ["Year of manufacture", asset.year_of_manufacture],
    ["Date of purchase", asset.date_of_purchase],
    ["Date of commissioning", asset.date_of_commissioning],
    ["Ownership status", asset.ownership_status],
    ["Owner", asset.owner],
    ["Current service provider", asset.current_service_provider],
    ["Present location/yard", asset.present_location_yard],
    ["Department/section", asset.department_section],
    ["Assigned ward/zone", asset.assigned_ward_zone],
  ]);

  // -----------------------------------------------------------------
  // Common Technical Information
  // -----------------------------------------------------------------
  renderFieldGrid("Common Technical Information", [
    ["Fuel/energy type", asset.fuel_energy_type],
    ["Operating weight", asset.operating_weight, "kg"],
    ["Length", asset.asset_length_mm, "mm"],
    ["Width", asset.asset_width_mm, "mm"],
    ["Height", asset.asset_height_mm, "mm"],
  ]);

  // -----------------------------------------------------------------
  // Meter Reading
  // -----------------------------------------------------------------
  renderFieldGrid("Meter Reading", [
    ["Meter type", asset.meter_type],
    ["Meter functional", asset.meter_functional],
    ["Current reading date", asset.current_reading_date],
    ["Current reading verified by", asset.current_reading_verified_by],
  ]);

  // -----------------------------------------------------------------
  // Asset-type-specific technical modules (technical_data JSONB,
  // labeled via the field-definition registry)
  // -----------------------------------------------------------------
  if (asset.asset_type_detail) {
    const modules = getTechnicalModulesForAssetType(asset.asset_type_detail);
    for (const mod of modules) {
      const allFields: Field[] = mod.fields.map((f) => [f.label, asset.technical_data[f.key], f.unit]);
      if (mod.subsections) {
        for (const sub of mod.subsections) {
          for (const f of sub.fields) allFields.push([`${sub.label} - ${f.label}`, asset.technical_data[f.key], f.unit]);
        }
      }
      renderFieldGrid(mod.label, allFields);
    }
  }

  // -----------------------------------------------------------------
  // Condition Assessment (component_condition, 1-5 scale)
  // -----------------------------------------------------------------
  const conditionLabelByValue = new Map(CONDITION_SCALE.map((c) => [c.value, c.label]));
  for (const group of CONDITION_COMPONENT_GROUPS) {
    const fields: Field[] = group.components.map((c) => {
      const score = survey.component_condition[c];
      return [c, score !== undefined ? `${score} - ${conditionLabelByValue.get(score) ?? ""}` : null];
    });
    renderFieldGrid(`Condition - ${group.group}`, fields);
  }

  // -----------------------------------------------------------------
  // Overall Assessment
  // -----------------------------------------------------------------
  const amcLabel = survey.amc_disposition ? AMC_DISPOSITION_OPTIONS.find((o) => o.value === survey.amc_disposition)?.label : null;
  renderFieldGrid("Overall Assessment", [
    ["Overall status", survey.overall_status],
    ["Safety status", survey.safety_status],
    ["Administrative disposition", survey.administrative_disposition],
    ["AMC/CMC assessment", amcLabel ? `${survey.amc_disposition} - ${amcLabel}` : survey.amc_disposition],
    ["Deployment status", survey.deployment_status],
  ]);

  // -----------------------------------------------------------------
  // Utilisation & Operations
  // -----------------------------------------------------------------
  const UTILISATION_FIELD_LABELS: [string, string][] = [
    ["avgKmDay", "Average km/day"],
    ["avgKmMonth", "Average km/month"],
    ["avgOperatingHoursDay", "Average operating hours/day"],
    ["avgOperatingDaysMonth", "Average operating days/month"],
    ["avgTripsDay", "Average trips/day"],
    ["avgLoadPerTrip", "Average load/trip"],
    ["avgTonnesDay", "Approx. tonnes handled/day"],
    ["breakdownsLast12Months", "Breakdowns - last 12 months"],
    ["totalBreakdownDowntime", "Total breakdown downtime"],
    ["avgBreakdownDuration", "Average breakdown duration"],
    ["accidentIncidentsLast12Months", "Accident incidents - last 12 months"],
  ];
  renderFieldGrid("Utilisation & Operations", [
    ...UTILISATION_FIELD_LABELS.map(([key, label]): Field => [label, survey.utilisation_data[key]]),
    ["Data source", survey.utilisation_data_source],
  ]);

  // -----------------------------------------------------------------
  // Defects (table, since each defect is a multi-field record rather
  // than a single label/value pair)
  // -----------------------------------------------------------------
  if (defects.length > 0) {
    sectionHeading(`Open Defects (${defects.length})`);
    doc.font("Helvetica").fontSize(8);
    for (const d of defects) {
      ensureSpace(24);
      const header = [d.component, d.sub_component, `[${d.severity}]`].filter(Boolean).join(" - ");
      doc.font("Helvetica-Bold").text(header, doc.page.margins.left, cursorY, { width: pageWidth });
      cursorY = doc.y;
      doc.font("Helvetica").text(d.description, doc.page.margins.left, cursorY, { width: pageWidth });
      cursorY = doc.y;
      const extra = [
        d.repair_priority ? `Priority: ${d.repair_priority}` : null,
        d.recommended_action ? `Action: ${d.recommended_action}` : null,
        d.estimated_repair_cost ? `Est. cost: ${d.estimated_repair_cost}` : null,
      ]
        .filter(Boolean)
        .join("  |  ");
      if (extra) {
        doc.fillColor("#555555").text(extra, doc.page.margins.left, cursorY, { width: pageWidth });
        cursorY = doc.y;
        doc.fillColor("#000000");
      }
      cursorY += 6;
    }
  }

  // -----------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------
  if (survey.notes && survey.notes.trim()) {
    sectionHeading("Notes");
    doc.font("Helvetica").fontSize(8.5).text(survey.notes, doc.page.margins.left, cursorY, { width: pageWidth });
    cursorY = doc.y + 6;
  }

  // -----------------------------------------------------------------
  // Sign-off - the surveying engineer's name and a signature line,
  // always the last thing on the page.
  // -----------------------------------------------------------------
  ensureSpace(70);
  cursorY += 20;
  const sigLineWidth = 200;
  doc
    .moveTo(doc.page.margins.left, cursorY)
    .lineTo(doc.page.margins.left + sigLineWidth, cursorY)
    .strokeColor("#000000")
    .lineWidth(0.75)
    .stroke();
  cursorY += 4;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(survey.surveyed_by, doc.page.margins.left, cursorY, { width: sigLineWidth });
  cursorY = doc.y;
  doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text("Surveying Engineer - Signature", doc.page.margins.left, cursorY, { width: sigLineWidth });

  doc.end();
  return doc;
}
