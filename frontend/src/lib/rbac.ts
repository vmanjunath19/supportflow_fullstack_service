import type { Ticket, TicketStatus, UserRole } from '../types/database';

export interface RolePermissions {
  role: UserRole;
  description: string;
  canViewAllTickets: boolean;
  canViewSlaGovernance: boolean;
  canCreateTicket: boolean;
  canAssignTeam: boolean;
  canEditResolutionNotes: boolean;
  canTransitionStatus: (currentStatus: TicketStatus, targetStatus: TicketStatus) => boolean;
  canDeleteTicket: boolean;
}

/**
 * Simulated authenticated End-User identity for portal scoping.
 * Matches seeded requester records so switching to End-User displays realistic self-service tickets.
 */
export const SIMULATED_END_USER_EMAIL = 'sarah.jenkins@company.com';

export const ROLE_PERMISSIONS_MATRIX: Record<UserRole, RolePermissions> = {
  'End-User': {
    role: 'End-User',
    description: 'Self-service portal: submit incidents and track personal ticket progress.',
    canViewAllTickets: false,
    canViewSlaGovernance: false,
    canCreateTicket: true,
    canAssignTeam: false,
    canEditResolutionNotes: false,
    canTransitionStatus: () => false,
    canDeleteTicket: false,
  },
  'Support Engineer': {
    role: 'Support Engineer',
    description: 'Operational triage: route tickets, update status workflows, and document resolutions.',
    canViewAllTickets: true,
    canViewSlaGovernance: false,
    canCreateTicket: true,
    canAssignTeam: true,
    canEditResolutionNotes: true,
    canTransitionStatus: (_currentStatus, targetStatus) =>
      ['Triaged', 'In Progress', 'Blocked', 'Resolved', 'Closed'].includes(targetStatus),
    canDeleteTicket: false,
  },
  'Admin/Manager': {
    role: 'Admin/Manager',
    description: 'Full governance: SLA escalation oversight, unrestricted transitions, and ticket deletion.',
    canViewAllTickets: true,
    canViewSlaGovernance: true,
    canCreateTicket: true,
    canAssignTeam: true,
    canEditResolutionNotes: true,
    canTransitionStatus: () => true,
    canDeleteTicket: true,
  },
};

export function getRolePermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS_MATRIX[role];
}

export function filterTicketsForRole(tickets: Ticket[], role: UserRole): Ticket[] {
  const perms = getRolePermissions(role);
  if (perms.canViewAllTickets) {
    return tickets;
  }
  return tickets.filter(
    (t) => t.requester_email.toLowerCase() === SIMULATED_END_USER_EMAIL.toLowerCase()
  );
}