import { pool } from "../config/db";
import type { LightFaultPenaltyRow, PenaltyPartyType } from "../types/streetlight.types";

export const lightFaultPenaltyRepository = {
  async listForFault(faultId: number): Promise<LightFaultPenaltyRow[]> {
    const { rows } = await pool.query<LightFaultPenaltyRow>(
      `SELECT * FROM light_fault_penalties WHERE fault_id = $1 ORDER BY penalty_date ASC, party_type ASC`,
      [faultId],
    );
    return rows;
  },

  /** Which (fault, penalty_date, party_type) rows already exist for a fault - used by the accrual job to know which days are already recorded and skip re-inserting them. */
  async listDatesForFault(faultId: number): Promise<{ penalty_date: string; party_type: PenaltyPartyType }[]> {
    const { rows } = await pool.query<{ penalty_date: string; party_type: PenaltyPartyType }>(
      `SELECT penalty_date, party_type FROM light_fault_penalties WHERE fault_id = $1`,
      [faultId],
    );
    return rows;
  },

  async create(input: { faultId: number; penaltyDate: string; partyType: PenaltyPartyType; partyUserId: number | null; amount: number }): Promise<LightFaultPenaltyRow> {
    const { rows } = await pool.query<LightFaultPenaltyRow>(
      `INSERT INTO light_fault_penalties (fault_id, penalty_date, party_type, party_user_id, amount)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (fault_id, penalty_date, party_type) DO NOTHING
       RETURNING *`,
      [input.faultId, input.penaltyDate, input.partyType, input.partyUserId, input.amount],
    );
    return rows[0]!;
  },

  /** Total penalty owed by a specific user, across all faults - the figure a contractor/city manager/DMC would see on their own dashboard. */
  async totalForUser(userId: number): Promise<string> {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM light_fault_penalties WHERE party_user_id = $1`,
      [userId],
    );
    return rows[0]?.total ?? "0";
  },

  /** Full penalty ledger across all faults, most recent first - the oversight view for municipal_commissioner/DMC. */
  async listAll(): Promise<LightFaultPenaltyRow[]> {
    const { rows } = await pool.query<LightFaultPenaltyRow>(`SELECT * FROM light_fault_penalties ORDER BY penalty_date DESC, id DESC`);
    return rows;
  },
};
