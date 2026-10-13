import { pool } from "../config/db";
import type { WhosWhoMeta, WhosWhoPublic, WhosWhoStatus } from "../types/whosWho.types";

// Explicit column list (no bytea) so a listing never pulls photos or scans into memory.
const META_COLUMNS = `id, designation, ward_no, area_charge, name_en, name_hi,
  to_char(date_assumed_office, 'YYYY-MM-DD') AS date_assumed_office,
  contact_number, contact_is_personal, email, public_message, form_no, signed_form_name,
  status, replaces_id, entered_by, entered_by_key, entered_at, verified_by, verified_at,
  verification_checks, published_by, published_at, returned_by, returned_at, return_reason,
  archived_by, archived_at, updated_at`;

// Public page order: by designation rank, then ward number, then date of joining.
const DESIGNATION_ORDER = `array_position(ARRAY['mayor','deputy_mayor','municipal_commissioner',
  'deputy_municipal_commissioner','city_manager','apswmo','assistant_architect',
  'assistant_town_planning_supervisor','head_clerk','ward_councillor'], designation)`;

export interface WhosWhoFields {
  designation: string;
  wardNo: number | null;
  areaCharge: string | null;
  nameEn: string;
  nameHi: string | null;
  dateAssumedOffice: string;
  contactNumber: string;
  contactIsPersonal: boolean;
  email: string | null;
  publicMessage: string | null;
  formNo: string | null;
}

export interface WhosWhoFiles {
  photo?: { mime: string; data: Buffer };
  signedForm?: { name: string; mime: string; data: Buffer };
}

export const whosWhoRepository = {
  async create(
    f: WhosWhoFields,
    files: Required<WhosWhoFiles>,
    by: { name: string; key: string },
    replacesId: string | null,
  ): Promise<WhosWhoMeta> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `INSERT INTO whos_who_entries (designation, ward_no, area_charge, name_en, name_hi, date_assumed_office,
         contact_number, contact_is_personal, email, public_message, form_no,
         photo_mime, photo_data, signed_form_name, signed_form_mime, signed_form_data,
         replaces_id, entered_by, entered_by_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${META_COLUMNS}`,
      [
        f.designation, f.wardNo, f.areaCharge, f.nameEn, f.nameHi, f.dateAssumedOffice,
        f.contactNumber, f.contactIsPersonal, f.email, f.publicMessage, f.formNo,
        files.photo.mime, files.photo.data, files.signedForm.name, files.signedForm.mime, files.signedForm.data,
        replacesId, by.name, by.key,
      ],
    );
    return rows[0]!;
  },

  /** Operator correction of a returned entry; resubmits it for verification. Files are replaced only if given. */
  async resubmit(id: string, f: WhosWhoFields, files: WhosWhoFiles): Promise<WhosWhoMeta | null> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `UPDATE whos_who_entries SET
         designation = $2, ward_no = $3, area_charge = $4, name_en = $5, name_hi = $6, date_assumed_office = $7,
         contact_number = $8, contact_is_personal = $9, email = $10, public_message = $11, form_no = $12,
         photo_mime = COALESCE($13, photo_mime), photo_data = COALESCE($14, photo_data),
         signed_form_name = COALESCE($15, signed_form_name), signed_form_mime = COALESCE($16, signed_form_mime),
         signed_form_data = COALESCE($17, signed_form_data),
         status = 'pending_verification', verified_by = NULL, verified_at = NULL, verification_checks = NULL,
         updated_at = now()
       WHERE id = $1 AND status = 'returned'
       RETURNING ${META_COLUMNS}`,
      [
        id, f.designation, f.wardNo, f.areaCharge, f.nameEn, f.nameHi, f.dateAssumedOffice,
        f.contactNumber, f.contactIsPersonal, f.email, f.publicMessage, f.formNo,
        files.photo?.mime ?? null, files.photo?.data ?? null,
        files.signedForm?.name ?? null, files.signedForm?.mime ?? null, files.signedForm?.data ?? null,
      ],
    );
    return rows[0] ?? null;
  },

  async findMetaById(id: string): Promise<WhosWhoMeta | null> {
    const { rows } = await pool.query<WhosWhoMeta>(`SELECT ${META_COLUMNS} FROM whos_who_entries WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async list(filter: { statuses?: WhosWhoStatus[]; enteredByKey?: string }): Promise<WhosWhoMeta[]> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `SELECT ${META_COLUMNS} FROM whos_who_entries
       WHERE ($1::text[] IS NULL OR status = ANY($1)) AND ($2::text IS NULL OR entered_by_key = $2)
       ORDER BY ${DESIGNATION_ORDER}, ward_no NULLS FIRST, id DESC`,
      [filter.statuses ?? null, filter.enteredByKey ?? null],
    );
    return rows;
  },

  /** City Manager: forward to the DMC. */
  async verify(id: string, by: string, checks: Record<string, boolean>): Promise<WhosWhoMeta | null> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `UPDATE whos_who_entries SET status = 'pending_publication', verified_by = $2, verified_at = now(),
         verification_checks = $3, return_reason = NULL, updated_at = now()
       WHERE id = $1 AND status = 'pending_verification'
       RETURNING ${META_COLUMNS}`,
      [id, by, JSON.stringify(checks)],
    );
    return rows[0] ?? null;
  },

  /** City Manager (from pending_verification) or DMC (from pending_publication): back to the operator. */
  async sendBack(id: string, fromStatus: WhosWhoStatus, by: string, reason: string): Promise<WhosWhoMeta | null> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `UPDATE whos_who_entries SET status = 'returned', returned_by = $3, returned_at = now(), return_reason = $4, updated_at = now()
       WHERE id = $1 AND status = $2
       RETURNING ${META_COLUMNS}`,
      [id, fromStatus, by, reason],
    );
    return rows[0] ?? null;
  },

  /**
   * DMC: publish. If the entry replaces a published one, that one is archived
   * in the same transaction. Returns { error } for a business-rule refusal.
   */
  async publish(id: string, by: string): Promise<{ entry?: WhosWhoMeta; error?: string }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query<WhosWhoMeta>(
        `SELECT ${META_COLUMNS} FROM whos_who_entries WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const e = cur.rows[0];
      if (!e || e.status !== "pending_publication") {
        await client.query("ROLLBACK");
        return { error: "This entry is not waiting for publication." };
      }
      if (e.replaces_id) {
        await client.query(
          `UPDATE whos_who_entries SET status = 'archived', archived_by = $2, archived_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'published'`,
          [e.replaces_id, by],
        );
      }
      try {
        const { rows } = await client.query<WhosWhoMeta>(
          `UPDATE whos_who_entries SET status = 'published', published_by = $2, published_at = now(), updated_at = now()
           WHERE id = $1 RETURNING ${META_COLUMNS}`,
          [id, by],
        );
        await client.query("COMMIT");
        return { entry: rows[0]! };
      } catch (err) {
        await client.query("ROLLBACK");
        if ((err as { code?: string }).code === "23505") {
          return {
            error:
              "Someone else is already published for this post. Archive the existing entry first, or have the operator enter this form as an update to it.",
          };
        }
        throw err;
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },

  /** DMC: take a published entry off the website (official has left office). */
  async archive(id: string, by: string): Promise<WhosWhoMeta | null> {
    const { rows } = await pool.query<WhosWhoMeta>(
      `UPDATE whos_who_entries SET status = 'archived', archived_by = $2, archived_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'published'
       RETURNING ${META_COLUMNS}`,
      [id, by],
    );
    return rows[0] ?? null;
  },

  /** Operator may withdraw an entry that is not yet published. */
  async withdraw(id: string, key: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `DELETE FROM whos_who_entries WHERE id = $1 AND entered_by_key = $2 AND status IN ('pending_verification', 'returned')`,
      [id, key],
    );
    return (rowCount ?? 0) > 0;
  },

  /** Is there already a draft/in-review update for this published entry? */
  async hasOpenReplacement(publishedId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM whos_who_entries WHERE replaces_id = $1 AND status IN ('pending_verification', 'pending_publication', 'returned')`,
      [publishedId],
    );
    return (rowCount ?? 0) > 0;
  },

  async listPublished(): Promise<WhosWhoPublic[]> {
    const { rows } = await pool.query<WhosWhoPublic>(
      `SELECT id, designation, ward_no, area_charge, name_en, name_hi,
         to_char(date_assumed_office, 'YYYY-MM-DD') AS date_assumed_office,
         contact_number, email, public_message,
         to_char(updated_at, 'YYYYMMDDHH24MISS') AS photo_version
       FROM whos_who_entries WHERE status = 'published'
       ORDER BY ${DESIGNATION_ORDER}, ward_no NULLS FIRST, date_assumed_office, id`,
    );
    return rows;
  },

  async findPhoto(id: string): Promise<{ photo_mime: string; photo_data: Buffer; status: WhosWhoStatus } | null> {
    const { rows } = await pool.query(`SELECT photo_mime, photo_data, status FROM whos_who_entries WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findSignedForm(id: string): Promise<{ signed_form_name: string; signed_form_mime: string; signed_form_data: Buffer } | null> {
    const { rows } = await pool.query(
      `SELECT signed_form_name, signed_form_mime, signed_form_data FROM whos_who_entries WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },
};
