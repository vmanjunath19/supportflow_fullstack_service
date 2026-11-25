import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PortalHomePage } from './pages/portal/PortalHomePage';
import { SubmitTicketPage } from './pages/portal/SubmitTicketPage';
import { TrackTicketsPage } from './pages/portal/TrackTicketsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { PortalLayout } from './components/portal/PortalLayout';
import { TicketDetailPage } from './pages/portal/TicketDetailPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Customer Self-Service Portal */}
        <Route element={<PortalLayout />}>
          <Route index element={<PortalHomePage />} />
          <Route path="tickets" element={<TrackTicketsPage />} />
          <Route path="tickets/new" element={<SubmitTicketPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        </Route>

        {/* Internal SupportFlow Agent Workspace */}
        <Route path="/workspace" element={<WorkspacePage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;