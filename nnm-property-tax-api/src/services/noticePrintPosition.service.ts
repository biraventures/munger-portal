import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

export interface PrintPositionInput {
  ward: string | null;
  partNo: number;
  partCount: number;
  /** The notices of this part in the order they are printed (Sl. No. 1 first). */
  demandNos: string[];
}

/** Records where each notice of a printed ward part sits (Sl. No. = order in the part). */
export async function recordPrintPositions(input: PrintPositionInput, admin: { displayName: string; role: string }): Promise<{ recorded: number }> {
  if (input.partNo > input.partCount) throw ApiError.badRequest("Part number is more than the number of parts.");
  if (input.demandNos.length === 0) return { recorded: 0 };
  const { rows } = await pool.query<{ demand_no: string; holding_no: string }>(
    `SELECT demand_no, holding_no FROM demand_notices WHERE demand_no = ANY($1::varchar[])`,
    [input.demandNos],
  );
  const holdingOf = new Map(rows.map((r) => [r.demand_no, r.holding_no]));
  const missing = input.demandNos.filter((d) => !holdingOf.has(d));
  if (missing.length) throw ApiError.badRequest(`Unknown demand notice(s): ${missing.slice(0, 5).join(", ")}`);
  await pool.query(
    `INSERT INTO notice_print_positions (demand_no, holding_no, ward, part_no, part_count, serial_no, part_size, printed_by, printed_by_role)
     SELECT d.demand_no, d.holding_no, $2, $3, $4, d.serial_no, $5, $6, $7
       FROM unnest($1::varchar[], $8::varchar[]) WITH ORDINALITY AS d(demand_no, holding_no, serial_no)`,
    [
      input.demandNos,
      input.ward,
      input.partNo,
      input.partCount,
      input.demandNos.length,
      admin.displayName,
      admin.role,
      input.demandNos.map((d) => holdingOf.get(d)!),
    ],
  );
  return { recorded: input.demandNos.length };
}

export interface NoticePrintPosition {
  demandNo: string;
  ward: string | null;
  partNo: number;
  partCount: number;
  serialNo: number;
  partSize: number;
  printedBy: string | null;
  printedAt: string;
  /** Status of that notice now: open / paid / superseded / cancelled. */
  noticeStatus: "open" | "paid" | "superseded" | "cancelled";
}

/** The latest printed-bundle positions of this holding's notices (most recent print first, up to 3). */
export async function printPositionsForHolding(holdingNo: string): Promise<NoticePrintPosition[]> {
  const { rows } = await pool.query(
    `SELECT pp.demand_no, pp.ward, pp.part_no, pp.part_count, pp.serial_no, pp.part_size, pp.printed_by, pp.printed_at,
            n.settled, n.superseded, n.cancelled
       FROM notice_print_positions pp
       JOIN demand_notices n ON n.demand_no = pp.demand_no
      WHERE pp.holding_no = $1
      ORDER BY pp.printed_at DESC, pp.id DESC
      LIMIT 3`,
    [holdingNo],
  );
  return rows.map((r) => ({
    demandNo: r.demand_no,
    ward: r.ward,
    partNo: r.part_no,
    partCount: r.part_count,
    serialNo: r.serial_no,
    partSize: r.part_size,
    printedBy: r.printed_by,
    printedAt: r.printed_at,
    noticeStatus: r.cancelled ? "cancelled" : r.settled ? "paid" : r.superseded ? "superseded" : "open",
  }));
}
