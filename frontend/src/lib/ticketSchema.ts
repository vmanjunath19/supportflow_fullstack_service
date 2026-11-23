import { z } from 'zod';
import type { TicketCategory, TicketPriority } from '../types/database';

export const TICKET_CATEGORIES: [TicketCategory, ...TicketCategory[]] = [
  'Hardware',
  'Software',
  'Network',
  'Access & IAM',
  'Database & Cloud',
  'Other',
];

export const IMPACT_LEVELS = ['Low', 'Medium', 'High', 'Enterprise-Wide'] as const;
export const URGENCY_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;

export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const createTicketSchema = z.object({
  title: z
    .string()
    .transform((val) => val.trim())
    .pipe(
      z
        .string()
        .min(5, 'Title must be at least 5 characters long.')
        .max(200, 'Title cannot exceed 200 characters.')
    ),
  description: z
    .string()
    .transform((val) => val.trim())
    .pipe(
      z
        .string()
        .min(10, 'Please provide at least 10 characters describing the issue or steps to reproduce.')
        .max(4000, 'Description cannot exceed 4,000 characters.')
    ),
  category: z.enum(TICKET_CATEGORIES, {
    message: 'Please select a valid ticket category.',
  }),
  impact: z.enum(IMPACT_LEVELS, {
    message: 'Please select an impact level.',
  }),
  urgency: z.enum(URGENCY_LEVELS, {
    message: 'Please select an urgency level.',
  }),
  requester_email: z
    .string()
    .trim()
    .min(1, 'Requester email is required.')
    .email('Enter a valid corporate email address (e.g., alex@company.com).'),
});

export type CreateTicketFormValues = z.input<typeof createTicketSchema>;
export type CreateTicketValidatedData = z.output<typeof createTicketSchema>;

/**
 * Standard ITIL Impact x Urgency -> Ticket Priority Matrix
 */
export function calculateTicketPriority(
  impact: ImpactLevel,
  urgency: UrgencyLevel
): TicketPriority {
  if (urgency === 'Critical' || (impact === 'Enterprise-Wide' && urgency === 'High')) {
    return 'Urgent';
  }
  if (
    impact === 'Enterprise-Wide' ||
    (impact === 'High' && (urgency === 'High' || urgency === 'Medium')) ||
    (impact === 'Medium' && urgency === 'High')
  ) {
    return 'High';
  }
  if (impact === 'Low' && urgency === 'Low') {
    return 'Low';
  }
  return 'Medium';
}