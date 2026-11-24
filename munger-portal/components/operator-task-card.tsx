import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface OperatorTaskCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string; // omit for a not-yet-live task
  /** Items waiting - shown as a red count. */
  badge?: number;
}

export function OperatorTaskCard({ title, description, icon: Icon, href, badge }: OperatorTaskCardProps) {
  const isLive = Boolean(href);

  const content = (
    <>
      <span
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
          isLive ? "bg-blue-50 text-nnm-blue" : "bg-slate-100 text-slate-400"
        }`}
      >
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h3 className={`mb-1.5 text-base font-semibold ${isLive ? "text-slate-900" : "text-slate-500"}`}>
        {title}
        {!!badge && (
          <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
            {badge.toLocaleString("en-IN")}
          </span>
        )}
      </h3>
      <p className="text-sm text-slate-500">{description}</p>
      {!isLive && (
        <span className="mt-3 inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          Coming soon
        </span>
      )}
    </>
  );

  if (!isLive) {
    return (
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 opacity-70">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href!}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
    >
      {content}
    </Link>
  );
}