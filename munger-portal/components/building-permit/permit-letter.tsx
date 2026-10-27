"use client";

import Image from "next/image";
import logoImg from "@/public/logo.png";
import { rupees, type PermitLetter } from "@/lib/building-permit-api";

const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-");

/** Printable building plan approval letter (A4). */
export function PermitLetterView({ p }: { p: PermitLetter }) {
  const row = (k: string, v: React.ReactNode) => (
    <tr>
      <td className="w-56 border border-slate-300 px-2 py-1 align-top text-slate-600">{k}</td>
      <td className="border border-slate-300 px-2 py-1">{v}</td>
    </tr>
  );
  return (
    <article className="mx-auto max-w-[780px] bg-white p-8 text-[13px] leading-relaxed text-black print:p-0">
      <header className="mb-4 flex items-center gap-3 border-b-2 border-black pb-3">
        <Image src={logoImg} alt="" width={56} height={56} className="h-14 w-14" />
        <div>
          <h1 className="text-lg font-bold">Nagar Nigam, Munger</h1>
          <p className="text-sm font-semibold">Building Plan Approval / Permit</p>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap justify-between gap-2">
        <p>
          Permit No: <b>{p.permitNo}</b>
        </p>
        <p>
          Date: <b>{d(p.issuedAt)}</b>
        </p>
      </div>
      <p className="mb-3">
        With reference to application no. <b>{p.applicationNo}</b>, the building plan described below is approved by the competent authority
        {p.authorityOrderNo ? (
          <>
            {" "}
            vide order no. <b>{p.authorityOrderNo}</b> dated <b>{d(p.authorityOrderDate)}</b>
          </>
        ) : null}
        , subject to construction strictly as per the approved drawing and the applicable building byelaws.
      </p>
      <table className="mb-4 w-full border-collapse">
        <tbody>
          {row("Applicant", <>{p.applicantName}{p.relationName ? `, ${p.relationName}` : ""}</>)}
          {row("Address of applicant", p.applicantAddress)}
          {row("Site", p.siteAddress)}
          {row("Ward / Mauza / Thana no.", `${p.ward} / ${p.mauza ?? "-"} / ${p.thanaNo ?? "-"}`)}
          {row("Khata no. / Khesra no.", `${p.khataNo} / ${p.khesraNo}`)}
          {row("Plot area", `${p.plotAreaSqm.toFixed(2)} sq m`)}
          {row("Use", p.useType)}
          {row(
            "Built-up area",
            <>
              <b>{p.builtUpSqm.toFixed(2)} sq m</b>
              {p.floors.length > 0 && <span className="block text-xs">{p.floors.map((f) => `${f.floor}: ${f.areaSqm} sq m`).join("; ")} (as applied)</span>}
            </>,
          )}
          {row("Architect", `${p.architectName} (UDHD reg. ${p.architectRegNo})`)}
          {row(
            "Fees paid",
            <>
              Development {rupees(p.fees.development)}, permit {rupees(p.fees.permit)}, labour cess {rupees(p.fees.labourCess)} - total <b>{rupees(p.fees.total)}</b>
              {p.paidAt ? ` on ${d(p.paidAt)}` : ""}
              {p.paymentRef ? `, ref. ${p.paymentRef}` : ""}
            </>,
          )}
          {row("Valid till", <b>{d(p.validTill)}</b>)}
        </tbody>
      </table>
      <p className="mb-10 text-xs">
        The approved drawing forms part of this permit. Any deviation from the approved plan, or construction after the validity date without renewal, is liable to action under the Bihar
        Municipal Act and the building byelaws.
      </p>
      <div className="flex justify-end">
        <div className="text-center">
          <div className="mb-1 h-12" />
          <p className="border-t border-black px-6 pt-1 font-semibold">Municipal Commissioner / Competent Authority</p>
          <p>Nagar Nigam, Munger</p>
        </div>
      </div>
    </article>
  );
}
