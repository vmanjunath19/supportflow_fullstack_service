export function TicketListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3"
    >
      <span className="sr-only">Loading support tickets...</span>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs animate-pulse"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2 flex-1 min-w-48">
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 rounded bg-slate-200" />
                <div className="h-4 w-24 rounded bg-slate-100" />
                <div className="h-5 w-16 rounded-md bg-slate-200" />
              </div>
              <div className="h-5 w-3/4 rounded bg-slate-200" />
            </div>
            <div className="h-6 w-24 rounded-full bg-slate-200" />
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="h-3.5 w-full rounded bg-slate-100" />
            <div className="h-3.5 w-5/6 rounded bg-slate-100" />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="h-3.5 w-44 rounded bg-slate-100" />
            <div className="h-3.5 w-36 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TicketDetailSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4 animate-pulse py-2"
    >
      <span className="sr-only">Loading ticket timeline...</span>
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded bg-slate-200" />
        <div className="h-5 w-24 rounded-full bg-slate-200" />
        <div className="h-5 w-16 rounded bg-slate-200" />
      </div>
      <div className="h-6 w-2/3 rounded bg-slate-200" />
      <div className="space-y-2 pt-2">
        <div className="h-3.5 w-full rounded bg-slate-100" />
        <div className="h-3.5 w-full rounded bg-slate-100" />
        <div className="h-3.5 w-3/4 rounded bg-slate-100" />
      </div>
      <div className="pt-4 space-y-3">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="h-12 w-full rounded-lg bg-slate-100" />
        <div className="h-12 w-full rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}