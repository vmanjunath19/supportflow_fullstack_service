import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackTicketsPage } from '../pages/portal/TrackTicketsPage';
import { SubmitTicketPage } from '../pages/portal/SubmitTicketPage';
import { mockFetchJson, renderWithProviders } from './testUtils';

describe('API Error Handling & Toast Notifications', () => {
  it('displays a toast error notification when ticket listing fails with HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson(500, { detail: 'PostgreSQL connection pool timeout' })
    );

    renderWithProviders(<TrackTicketsPage />, { initialEntries: ['/tickets'] });

    const alerts = await screen.findAllByText(/PostgreSQL connection pool timeout/i);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('displays a toast error notification when ticket creation returns HTTP 422', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      mockFetchJson(422, {
        detail: [{ loc: ['body', 'requester_email'], msg: 'domain is not allowed' }],
      })
    );

    renderWithProviders(<SubmitTicketPage />, { initialEntries: ['/tickets/new'] });

    // Step 1
    await user.type(screen.getByLabelText(/your work email/i), 'guest@blocked.example');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2
    await user.type(
      await screen.findByLabelText(/incident summary/i),
      'Need access to staging environment'
    );
    await user.type(
      screen.getByLabelText(/detailed description/i),
      'Requesting read-only staging logs access for QA verification.'
    );
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3 -> Submit
    await user.click(await screen.findByRole('button', { name: /submit support request/i }));

    const toastMatches = await screen.findAllByText(/requester_email: domain is not allowed/i);
    expect(toastMatches.length).toBeGreaterThanOrEqual(1);
  });
});