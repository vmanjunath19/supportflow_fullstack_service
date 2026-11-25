import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ticketsApi,
  type CreateTicketRequest,
  type PaginatedTicketsResponse,
  type TicketDetailResponse,
  type TicketListFilters,
  type UpdateTicketRequest,
} from '../lib/apiClient';
import type { Ticket } from '../types/database';

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (filters: TicketListFilters) => [...ticketKeys.lists(), filters] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
};

export function useTicketsQuery(
  filters: TicketListFilters = {},
  options?: Omit<UseQueryOptions<PaginatedTicketsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () => ticketsApi.list(filters),
    refetchInterval: 20_000, // Automatic 20s background polling
    ...options,
  });
}

export function useTicketDetailQuery(
  ticketId: string | undefined,
  options?: Omit<UseQueryOptions<TicketDetailResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ticketKeys.detail(ticketId ?? ''),
    queryFn: () => ticketsApi.getById(ticketId!),
    enabled: Boolean(ticketId),
    refetchInterval: 20_000,
    ...options,
  });
}

export function useCreateTicketMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTicketRequest) => ticketsApi.create(payload),
    onMutate: async (newTicketInput) => {
      await queryClient.cancelQueries({ queryKey: ticketKeys.lists() });

      const previousLists = queryClient.getQueriesData<PaginatedTicketsResponse>({
        queryKey: ticketKeys.lists(),
      });

      // Optimistically prepend a temporary ticket into matching cached lists
      const optimisticTicket: Ticket = {
        id: `temp-${Date.now()}`,
        ticket_number: 0,
        title: newTicketInput.title,
        description: newTicketInput.description,
        category: newTicketInput.category,
        priority: newTicketInput.priority,
        status: 'New',
        requester_email: newTicketInput.requester_email,
        team_id: null,
        sla_policy_id: null,
        resolution_notes: null,
        sla_due_at: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: null,
      };

      queryClient.setQueriesData<PaginatedTicketsResponse>(
        { queryKey: ticketKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [optimisticTicket, ...old.items],
          };
        }
      );

      return { previousLists };
    },
    onError: (_err, _newTicket, context) => {
      // Roll back optimistic list insertion if the POST request fails
      context?.previousLists.forEach(([queryKey, snapshot]) => {
        queryClient.setQueryData(queryKey, snapshot);
      });
    },
    onSuccess: (created) => {
      const formattedId = `INC-${String(created.ticket_number).padStart(4, '0')}`;
      toast.success(`Ticket ${formattedId} created successfully`);
      // Seed the individual ticket detail cache immediately
      queryClient.setQueryData<TicketDetailResponse>(ticketKeys.detail(created.id), {
        ticket: created,
        sla: {
          sla_due_at: created.sla_due_at,
          is_breached: false,
          remaining_seconds: null,
        },
        audit_events: [],
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

export function useUpdateTicketMutation(ticketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: UpdateTicketRequest) => ticketsApi.update(ticketId, updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ticketKeys.detail(ticketId) });
      await queryClient.cancelQueries({ queryKey: ticketKeys.lists() });

      const previousDetail = queryClient.getQueryData<TicketDetailResponse>(
        ticketKeys.detail(ticketId)
      );
      const previousLists = queryClient.getQueriesData<PaginatedTicketsResponse>({
        queryKey: ticketKeys.lists(),
      });

      const nowIso = new Date().toISOString();

      // Optimistically patch the detail cache
      queryClient.setQueryData<TicketDetailResponse>(
        ticketKeys.detail(ticketId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            ticket: {
              ...old.ticket,
              ...updates,
              updated_at: nowIso,
            },
          };
        }
      );

      // Optimistically patch matching rows across all list caches
      queryClient.setQueriesData<PaginatedTicketsResponse>(
        { queryKey: ticketKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === ticketId ? { ...item, ...updates, updated_at: nowIso } : item
            ),
          };
        }
      );

      return { previousDetail, previousLists };
    },
    onError: (_err, _updates, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(ticketKeys.detail(ticketId), context.previousDetail);
      }
      context?.previousLists.forEach(([queryKey, snapshot]) => {
        queryClient.setQueryData(queryKey, snapshot);
      });
    },
    onSuccess: (updatedTicket) => {
      toast.success(
        `INC-${String(updatedTicket.ticket_number).padStart(4, '0')} updated`
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}