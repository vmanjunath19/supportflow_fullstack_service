import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PortalLayout } from '../components/portal/PortalLayout';
import { PortalHomePage } from '../pages/portal/PortalHomePage';
import { SubmitTicketPage } from '../pages/portal/SubmitTicketPage';
import { TrackTicketsPage } from '../pages/portal/TrackTicketsPage';
import { TicketDetailPage } from '../pages/portal/TicketDetailPage';
import { createTestQueryClient, mockFetchJson } from './testUtils';

function renderPortalApp(initialRoute = '/') {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<PortalLayout />}>
            <Route index element={<PortalHomePage />} />
            <Route path="tickets" element={<TrackTicketsPage />} />
            <Route path="tickets/new" element={<SubmitTicketPage />} />
            <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
          </Route>
          <Route path="/workspace" element={<h1>Agent Workspace View</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Portal Navigation, Mobile Menu & Breadcrumbs', () => {
  it('navigates from Help Center to Submit Request, My Tickets, and Agent Workspace', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal('fetch', mockFetchJson(200, { items: [] }));

    renderPortalApp('/');

    expect(screen.getByRole('heading', { name: /how can we help you today/i })).toBeInTheDocument();

    // Navigate to Submit Request via hero CTA
    await user.click(screen.getByRole('link', { name: /submit a ticket/i }));
    expect(
      await screen.findByRole('heading', { name: /submit a support request/i })
    ).toBeInTheDocument();

    // Breadcrumb reflects current route
    const breadcrumbNav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(breadcrumbNav).toHaveTextContent('Help Center');
    expect(breadcrumbNav).toHaveTextContent('Submit Request');

    // Navigate to My Tickets via desktop top navbar
    const topNav = screen.getByRole('navigation', { name: /^portal navigation$/i });
    await user.click(within(topNav).getByRole('link', { name: /my tickets/i }));
    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeInTheDocument();

    // Switch to Agent Workspace
    await user.click(screen.getByRole('link', { name: /agent workspace/i }));
    expect(await screen.findByRole('heading', { name: /agent workspace view/i })).toBeInTheDocument();
  });

  it('toggles the mobile navigation drawer and closes when a link is selected', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortalApp('/');

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = screen.getByRole('navigation', { name: /mobile portal navigation/i });
    expect(mobileNav).toBeInTheDocument();

    // Click Submit Request inside mobile drawer
    await user.click(within(mobileNav).getByRole('link', { name: /submit request/i }));
    expect(
      await screen.findByRole('heading', { name: /submit a support request/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: /mobile portal navigation/i })
    ).not.toBeInTheDocument();
  });

  it('renders TicketDetailPage with complete progress stages and audit events', async () => {
    const ticketId = '99999999-9999-9999-9999-999999999999';

    vi.stubGlobal(
      'fetch',
      mockFetchJson(200, {
        ticket: {
          id: ticketId,
          ticket_number: 7,
          title: 'Configure read-only analytics replica',
          description: 'Need replica credentials for BI dashboard.',
          category: 'Database & Cloud',
          priority: 'Medium',
          status: 'Triaged',
          requester_email: 'data@supportflow.local',
          team_id: null,
          sla_policy_id: null,
          resolution_notes: null,
          sla_due_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
          resolved_at: null,
          created_at: new Date().toISOString(),
          updated_at: null,
        },
        sla: { sla_due_at: null, is_breached: false, remaining_seconds: 43200 },
        audit_events: [
          {
            id: 'evt-1',
            ticket_id: ticketId,
            actor: 'data@supportflow.local',
            event_type: 'CREATED',
            previous_state: null,
            new_state: 'New',
            metadata: null,
            created_at: new Date().toISOString(),
          },
          {
            id: 'evt-2',
            ticket_id: ticketId,
            actor: 'support.engineer@supportflow.local',
            event_type: 'TEAM_REASSIGNED',
            previous_state: 'Unassigned',
            new_state: 'Cloud & DB Ops',
            metadata: null,
            created_at: new Date().toISOString(),
          },
        ],
      })
    );

    renderPortalApp(`/tickets/${ticketId}`);

    expect(await screen.findByText('Complete Historical Timeline')).toBeInTheDocument();
    expect(screen.getByText('Ticket Created')).toBeInTheDocument();
    expect(screen.getByText('Engineer / Team Assignment')).toBeInTheDocument();
    expect(screen.getByText(/Cloud & DB Ops/)).toBeInTheDocument();
  });
});