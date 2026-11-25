import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  tickets: 'My Tickets',
  new: 'Submit Request',
};

export function Breadcrumbs({ items }: { items?: BreadcrumbItem[] }) {
  const { pathname } = useLocation();

  if (pathname === '/' && !items) return null;
  // Hide automatic layout breadcrumbs on root or detail pages (which render their own custom INC-XXXX trail)
  if (!items && (pathname === '/' || /^\/tickets\/[^/]+$/.test(pathname) && pathname !== '/tickets/new')) {
    return null;
  }

  const trail: BreadcrumbItem[] =
    items ??
    (() => {
      const segments = pathname.split('/').filter(Boolean);
      const built: BreadcrumbItem[] = [{ label: 'Help Center', to: '/' }];

      segments.forEach((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label =
          ROUTE_LABELS[segment] ??
          decodeURIComponent(segment).replace(/-/g, ' ');

        built.push({
          label,
          to: isLast ? undefined : href,
        });
      });

      return built;
    })();

  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-slate-500">
        {trail.map((item, idx) => {
          const isLast = idx === trail.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-slate-400 shrink-0"
                  aria-hidden="true"
                />
              )}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-indigo-600 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {idx === 0 && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-xs"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}