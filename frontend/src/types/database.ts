export type TicketStatus =
  | 'New'
  | 'Triaged'
  | 'In Progress'
  | 'Blocked'
  | 'Resolved'
  | 'Closed';

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type TicketCategory =
  | 'Hardware'
  | 'Software'
  | 'Network'
  | 'Access & IAM'
  | 'Database & Cloud'
  | 'Other';

export type UserRole = 'End-User' | 'Support Engineer' | 'Admin/Manager';

export interface SupportTeam {
  id: string;
  name: string;
  default_category: TicketCategory | null;
  escalation_email: string;
  is_active: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  team_id: string | null;
  sla_policy_id: string | null;
  requester_email: string;
  resolution_notes: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined relation from support_teams
  support_teams?: {
    name: string;
  } | null;
}