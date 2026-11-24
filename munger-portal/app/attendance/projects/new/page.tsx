"use client";

import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import { PROJECT_ENTRY_ROLES } from "@/lib/project-api";
import { BackLink } from "@/components/projects/parts";
import { ProjectFormView } from "@/components/projects/project-form";

export default function NewProjectPage() {
  const user = useAttendanceGuard(PROJECT_ENTRY_ROLES as AttendanceRole[]);
  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <BackLink href="/attendance/projects" label="Projects" />
        <h1 className="mb-5 text-2xl font-semibold text-slate-900">Add a project</h1>
        <ProjectFormView />
      </main>
    </div>
  );
}
