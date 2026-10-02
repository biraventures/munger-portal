import type { ReactNode } from "react";
import { AttendanceLangProvider } from "@/lib/attendance-i18n";

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  return <AttendanceLangProvider>{children}</AttendanceLangProvider>;
}
