import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-2xs sm:px-12"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>

      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500 leading-relaxed">
        {description}
      </p>

      {(actionLabel || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && actionTo && (
            <Link
              to={actionTo}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {actionLabel}
            </Link>
          )}
          {actionLabel && onAction && !actionTo && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {actionLabel}
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}