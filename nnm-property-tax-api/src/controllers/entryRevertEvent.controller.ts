import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { entryRevertEventRepository } from "../repositories/entryRevertEvent.repository";
import { addSheetFromRows } from "../services/export.service";
import { asyncHandler } from "../middleware/asyncHandler";

/** GET /api/v1/admin/entry-revert-events - Commissioner only. The complete revert-to-operator audit trail across property mutations and shop agreements. */
export const listEntryRevertEventsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const events = await entryRevertEventRepository.listAll();
  res.status(200).json({ events });
});

/** GET /api/v1/admin/entry-revert-events/export - Commissioner only. The same trail as a downloadable .xlsx. */
export const exportEntryRevertEventsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const events = await entryRevertEventRepository.listAll();

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Revert Events", events as unknown as Record<string, unknown>[]);

  const filename = `revert-audit-trail-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
