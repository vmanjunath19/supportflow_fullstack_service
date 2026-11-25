import type {
  Ticket,
  TicketCategory,
  TicketEvent,
  TicketPriority,
  TicketStatus,
} from '../types/database';
import type { CreateTicketValidatedData } from './ticketSchema';

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export interface PaginatedTicketsResponse {
  items: Ticket[];
  total?: number;
  limit: number;
  offset?: number;
}

export interface TicketDetailResponse {
  ticket: Ticket;
  sla: {
    sla_due_at: string | null;
    is_breached: boolean;
    remaining_seconds: number | null;
  };
  audit_events: TicketEvent[];
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  impact?: CreateTicketValidatedData['impact'];
  urgency?: CreateTicketValidatedData['urgency'];
  requester_email: string;
}

export interface UpdateTicketRequest {
  status?: TicketStatus;
  priority?: TicketPriority;
  team_id?: string | null;
  resolution_notes?: string | null;
  actor?: string;
}

export interface TicketListFilters {
  requester_email?: string;
  status?: TicketStatus;
  limit?: number;
  offset?: number;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;

  if (typeof record.detail === 'string') {
    return record.detail;
  }

  // Handle FastAPI / Pydantic 422 validation error arrays
  if (Array.isArray(record.detail) && record.detail.length > 0) {
    const first = record.detail[0] as Record<string, unknown>;
    const loc = Array.isArray(first.loc) ? first.loc.slice(1).join('.') : '';
    const msg = typeof first.msg === 'string' ? first.msg : 'Invalid input';
    return loc ? `${loc}: ${msg}` : msg;
  }

  return fallback;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (networkErr) {
    throw new ApiError(
      networkErr instanceof Error
        ? `Network error: ${networkErr.message}`
        : 'Unable to reach SupportFlow API. Check your connection.',
      0
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(payload, `Request failed with status ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}

export const ticketsApi = {
  list(filters: TicketListFilters = {}): Promise<PaginatedTicketsResponse> {
    const params = new URLSearchParams();
    params.set('limit', String(filters.limit ?? 50));
    if (filters.offset !== undefined) params.set('offset', String(filters.offset));
    if (filters.requester_email?.trim()) {
      params.set('requester_email', filters.requester_email.trim());
    }
    if (filters.status) {
      params.set('status', filters.status);
    }
    return request<PaginatedTicketsResponse>(`/api/tickets?${params.toString()}`);
  },

  getById(ticketId: string): Promise<TicketDetailResponse> {
    return request<TicketDetailResponse>(`/api/tickets/${encodeURIComponent(ticketId)}`);
  },

  create(body: CreateTicketRequest): Promise<Ticket> {
    return request<Ticket>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  update(ticketId: string, body: UpdateTicketRequest): Promise<Ticket> {
    return request<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};