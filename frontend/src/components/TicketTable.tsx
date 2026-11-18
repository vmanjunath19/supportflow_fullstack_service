import {
  Clock,
  AlertCircle,
  UserCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SearchX,
} from 'lucide-react';
import type { Ticket } from '../types/database';
import { PriorityBadge, StatusBadge } from './TicketBadges';

export type SortField =
  | 'ticket_number'
  | 'title'
  | 'status'
  | 'priority'
  | 'category'
  | 'team';

export type SortDirection = 'asc' | 'desc';

interface TicketTableProps {
  tickets: Ticket[];
  isLoading: boolean;
  error: string | null;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onSelectTicket?: (ticket: Ticket) => void;
}

function formatTicketId(num: number): string {
  return `INC-${String(num).padStart(4, '0')}`;
}

function isSlaBreached(ticket: Ticket): boolean {
  if (!ticket.sla_due_at) return false;
  if (ticket.status === 'Resolved' || ticket.status === 'Closed') return false;
  return new Date(ticket.sla_due_at).getTime() < Date.now();
}

export function TicketTable({
  tickets,
  isLoading,
  error,
  sortField,
  sortDirection,
  onSortChange,
  hasActiveFilters,
  onResetFilters,
  onSelectTicket,
}: TicketTableProps) {
  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
    );
  }

  function getAriaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-8"
        role="status"
        aria-live="polite"
      >
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-rose-50 border border-rose-200 rounded-xl p-6 flex items-start gap-3 text-rose-800"
        role="alert"
      >
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold">Failed to load incident queue</h3>
          <p className="text-xs mt-1 text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <SearchX className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">No matching tickets found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          {hasActiveFilters
            ? 'No tickets matched your current search query or filter selections.'
            : 'There are currently no tickets in this queue view.'}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                aria-sort={getAriaSort('ticket_number')}
                className="py-3.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:pl-6 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('ticket_number')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Ticket ID</span>
                  {renderSortIcon('ticket_number')}
                </button>
              </th>

              <th
                scope="col"
                aria-sort={getAriaSort('title')}
                className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('title')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Title</span>
                  {renderSortIcon('title')}
                </button>
              </th>

              <th
                scope="col"
                aria-sort={getAriaSort('status')}
                className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('status')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Status</span>
                  {renderSortIcon('status')}
                </button>
              </th>

              <th
                scope="col"
                aria-sort={getAriaSort('priority')}
                className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('priority')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Priority</span>
                  {renderSortIcon('priority')}
                </button>
              </th>

              <th
                scope="col"
                aria-sort={getAriaSort('category')}
                className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('category')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Category</span>
                  {renderSortIcon('category')}
                </button>
              </th>

              <th
                scope="col"
                aria-sort={getAriaSort('team')}
                className="py-3.5 pl-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:pr-6 hidden sm:table-cell whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSortChange('team')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 group cursor-pointer"
                >
                  <span>Assigned Team</span>
                  {renderSortIcon('team')}
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {tickets.map((ticket) => {
              const breached = isSlaBreached(ticket);
              const teamName = ticket.support_teams?.name;

              return (
                <tr
                  key={ticket.id}
                  tabIndex={0}
                  onClick={() => onSelectTicket?.(ticket)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTicket?.(ticket);
                    }
                  }}
                  className="hover:bg-slate-50/90 focus:bg-indigo-50/40 focus:outline-none transition-colors cursor-pointer group"
                >
                  <td className="py-3.5 pl-4 pr-3 text-xs font-mono font-semibold text-slate-700 sm:pl-6 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span>{formatTicketId(ticket.ticket_number)}</span>
                      {breached && (
                        <span
                          title="SLA Breached"
                          aria-label="SLA Breached"
                          className="inline-flex items-center text-rose-600"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3.5 text-sm max-w-md">
                    <div className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                      {ticket.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <span className="truncate">{ticket.requester_email}</span>
                      <span className="md:hidden text-slate-400">• {ticket.category}</span>
                    </div>
                  </td>

                  <td className="px-3 py-3.5 text-sm whitespace-nowrap">
                    <StatusBadge status={ticket.status} />
                  </td>

                  <td className="px-3 py-3.5 text-sm whitespace-nowrap">
                    <PriorityBadge priority={ticket.priority} />
                  </td>

                  <td className="px-3 py-3.5 text-xs text-slate-600 hidden md:table-cell whitespace-nowrap">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                      {ticket.category}
                    </span>
                  </td>

                  <td className="py-3.5 pl-3 pr-4 text-xs sm:pr-6 hidden sm:table-cell whitespace-nowrap">
                    {teamName ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                        {teamName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-600/20 font-medium">
                        Unassigned
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}