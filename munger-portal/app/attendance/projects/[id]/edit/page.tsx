"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import { PROJECT_ENTRY_ROLES, fetchProject, formFromProject, type ProjectForm } from "@/lib/project-api";
import { BackLink, ErrorLine, Spinner } from "@/components/projects/parts";
import { ProjectFormView } from "@/components/projects/project-form";

export default function EditProjectPage() {
  const user = useAttendanceGuard(PROJECT_ENTRY_ROLES as AttendanceRole[]);
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProject(id)
      .then((d) => setForm(formFromProject(d.project)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the project."));
  }, [user, id]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <BackLink href={`/attendance/projects/${id}`} label="Back to the project" />
        <h1 className="mb-5 text-2xl font-semibold text-slate-900">Edit project</h1>
        <ErrorLine error={error} />
        {form ? <ProjectFormView id={id} initial={form} /> : !error && <Spinner />}
      </main>
    </div>
  );
}
