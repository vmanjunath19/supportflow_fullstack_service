import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmitTicketPage } from '../pages/portal/SubmitTicketPage';
import { mockFetchJson, renderWithProviders } from './testUtils';

describe('SubmitTicketPage (Self-Service Submission Wizard)', () => {
  it('blocks advancing from Step 1 when email is empty or invalid', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SubmitTicketPage />, { initialEntries: ['/tickets/new'] });

    // Attempt to advance without entering an email
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      await screen.findByText(/email is required|valid.*email|invalid email/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/incident summary/i)).not.toBeInTheDocument();

    // Enter malformed email
    const emailInput = screen.getByLabelText(/your work email/i);
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      await screen.findByText(/valid.*email|invalid email/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/incident summary/i)).not.toBeInTheDocument();
  });
  it('validates Step 2 title and description minimum lengths before Step 3', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SubmitTicketPage />, { initialEntries: ['/tickets/new'] });

    // Complete Step 1
    await user.click(screen.getByRole('button', { name: /network & vpn/i }));
    fireEvent.change(screen.getByLabelText(/your work email/i), {
      target: { value: 'alex@supportflow.local' },
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2: submit too-short title and description
    const titleInput = await screen.findByLabelText(/incident summary/i);
    const descInput = screen.getByLabelText(/detailed description/i);

    fireEvent.change(titleInput, { target: { value: 'VPN' } });
    fireEvent.change(descInput, { target: { value: 'Down' } });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/title must be at least 5 characters/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/please provide at least 10 characters/i)
    ).toBeInTheDocument();
  });

  it('toggles Urgent Outage flag on Step 3 and displays generated Ticket ID on submit', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockFetchJson(201, {
      id: '11111111-1111-1111-1111-111111111111',
      ticket_number: 42,
      title: 'Production database connection pool exhausted',
      description: 'API endpoints returning HTTP 503 across eu-west-2 cluster.',
      category: 'Database & Cloud',
      priority: 'Urgent',
      status: 'New',
      requester_email: 'oncall@supportflow.local',
      team_id: null,
      sla_policy_id: null,
      resolution_notes: null,
      sla_due_at: new Date(Date.now() + 3600_000).toISOString(),
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<SubmitTicketPage />, { initialEntries: ['/tickets/new'] });

    // Step 1
    await user.click(screen.getByRole('button', { name: /database & cloud/i }));
    fireEvent.change(screen.getByLabelText(/your work email/i), {
      target: { value: 'oncall@supportflow.local' },
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2
    fireEvent.change(await screen.findByLabelText(/incident summary/i), {
      target: { value: 'Production database connection pool exhausted' },
    });
    fireEvent.change(screen.getByLabelText(/detailed description/i), {
      target: { value: 'API endpoints returning HTTP 503 across eu-west-2 cluster.' },
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3: Toggle Urgent Outage switch and verify switch state + priority update
    const urgentSwitch = await screen.findByRole('switch');
    expect(urgentSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(urgentSwitch);
    expect(urgentSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/24 hours target response/i)).not.toBeInTheDocument();

    // Submit form
    await user.click(screen.getByRole('button', { name: /submit support request/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tickets',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(await screen.findByText('Support Request Created')).toBeInTheDocument();
    expect(screen.getByText('INC-0042')).toBeInTheDocument();
  });
});