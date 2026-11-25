import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackTicketsPage } from '../pages/portal/TrackTicketsPage';
import type { Ticket } from '../types/database';
import { mockFetchJson, renderWithProviders } from './testUtils';

const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'aaaa-1111',
    ticket_number: 101,
    title: 'SSO login redirect loop on Safari',
    description: 'Users get stuck on Okta callback.',
    category: 'Access & IAM',
    priority: 'High',
    status: 'In Progress',
    requester_email: 'jamie@supportflow.local',
    team_id: null,
    sla_policy_id: null,
    resolution_notes: null,
    sla_due_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: 'bbbb-2222',
    ticket_number: 102,
    title: 'Core billing webhook timeout',
    description: 'Stripe webhook retries failing.',
    category: 'Database & Cloud',
    priority: 'Urgent',
    status: 'Triaged',
    requester_email: 'jamie@supportflow.local',
    team_id: null,
    sla_policy_id: null,
    resolution_notes: null,
    sla_due_at: new Date(Date.now() - 45 * 60_000).toISOString(), // Breached 45m ago
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: 'cccc-3333',
    ticket_number: 99,
    title: 'Replace faulty USB-C dock',
    description: 'Second monitor flickering intermittently.',
    category: 'Hardware',
    priority: 'Low',
    status: 'Resolved',
    requester_email: 'jamie@supportflow.local',
    team_id: null,
    sla_policy_id: null,
    resolution_notes: 'Issued replacement Thunderbolt dock at Perth desk 4B.',
    sla_due_at: null,
    resolved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: null,
  },
];

describe('TrackTicketsPage (My Tickets Listing & Search)', () => {
  it('renders open tickets with live SLA countdowns and switches to resolved tickets tab', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchJson(200, { items: SAMPLE_TICKETS }));

    renderWithProviders(<TrackTicketsPage />, {
      initialEntries: ['/tickets?email=jamie@supportflow.local'],
    });

    // Open tab is active by default (2 open tickets, 1 resolved)
    expect(await screen.findByText('SSO login redirect loop on Safari')).toBeInTheDocument();
    expect(screen.getByText('Core billing webhook timeout')).toBeInTheDocument();
    expect(screen.queryByText('Replace faulty USB-C dock')).not.toBeInTheDocument();

    // Live SLA indicators render
    expect(screen.getByText(/SLA: (1h 59m|2h 0m) left/i)).toBeInTheDocument();
    expect(screen.getByText(/SLA Breached/i)).toBeInTheDocument();

    // Switch to Resolved tab
    await user.click(screen.getByRole('tab', { name: /resolved/i }));

    expect(await screen.findByText('Replace faulty USB-C dock')).toBeInTheDocument();
    expect(
      screen.getByText(/Issued replacement Thunderbolt dock at Perth desk 4B/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('SSO login redirect loop on Safari')).not.toBeInTheDocument();
  });

  it('filters tickets in real time by keyword or ticket ID and shows accessible empty state when none match', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchJson(200, { items: SAMPLE_TICKETS }));

    renderWithProviders(<TrackTicketsPage />, { initialEntries: ['/tickets'] });

    expect(await screen.findByText('SSO login redirect loop on Safari')).toBeInTheDocument();

    const searchInput = screen.getByLabelText(/search tickets by id, title, or category/i);
    await user.type(searchInput, 'INC-0102');

    expect(screen.getByText('Core billing webhook timeout')).toBeInTheDocument();
    expect(screen.queryByText('SSO login redirect loop on Safari')).not.toBeInTheDocument();

    // Search non-existent term -> renders EmptyState
    await user.clear(searchInput);
    await user.type(searchInput, 'nonexistent-query-xyz');

    expect(await screen.findByText('No matching tickets found')).toBeInTheDocument();
  });
});