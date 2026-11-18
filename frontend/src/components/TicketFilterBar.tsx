import { Search, X, Filter } from 'lucide-react';
import type { TicketCategory, TicketPriority, TicketStatus } from '../types/database';

export interface TicketFilters {
  search: string;
  status: TicketStatus | 'ALL';
  priority: TicketPriority | 'ALL';
  category: TicketCategory | 'ALL';
}

interface TicketFilterBarProps {
  filters: TicketFilters;
  onChange: (next: TicketFilters) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

const STATUS_OPTIONS: TicketStatus[] = [
  'New',
  'Triaged',
  'In Progress',
  'Blocked',
  'Resolved',
  'Closed',
];

const PRIORITY_OPTIONS: TicketPriority[] = ['Urgent', 'High', 'Medium', 'Low'];

const CATEGORY_OPTIONS: TicketCategory[] = [
  'Hardware',
  'Software',
  'Network',
  'Access & IAM',
  'Database & Cloud',
  'Other',
];

export function TicketFilterBar({
  filters,
  onChange,
  onReset,
  totalCount,
  filteredCount,
}: TicketFilterBarProps) {
  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'ALL' ||
    filters.priority !== 'ALL' ||
    filters.category !== 'ALL';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Real-time Text Search */}
        <div className="relative flex-1 min-w-64">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search by ticket ID, title, requester, or team..."
            aria-label="Search tickets"
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: '' })}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-1">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Filters:</span>
          </div>

          {/* Status Dropdown */}
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) =>
              onChange({ ...filters, status: e.target.value as TicketStatus | 'ALL' })
            }
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          {/* Priority Dropdown */}
          <select
            aria-label="Filter by priority"
            value={filters.priority}
            onChange={(e) =>
              onChange({ ...filters, priority: e.target.value as TicketPriority | 'ALL' })
            }
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>

          {/* Category Dropdown */}
          <select
            aria-label="Filter by category"
            value={filters.category}
            onChange={(e) =>
              onChange({ ...filters, category: e.target.value as TicketCategory | 'ALL' })
            }
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-2 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Live Result Counter Bar */}
      {hasActiveFilters && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-800">{filteredCount}</strong> of{' '}
            <strong className="text-slate-800">{totalCount}</strong> tickets in current view
          </span>
        </div>
      )}
    </div>
  );
}