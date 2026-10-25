import { useCallback } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useLogout, useMe } from './api/hooks.js';
import { useToast } from './components/Toasts.jsx';
import { RoleBadge } from './components/ui.jsx';
import { canManageMembers } from './lib/permissions.js';
import { LoginPage, SignupPage } from './pages/AuthPages.jsx';
import { MembersPage } from './pages/MembersPage.jsx';
import { TicketDetailPage } from './pages/TicketDetailPage.jsx';
import { TicketsPage } from './pages/TicketsPage.jsx';
import { useRealtime } from './realtime/useRealtime.js';

export function App() {
  const me = useMe();

  if (me.isLoading) return <div className="splash">Loading…</div>;

  if (!me.data)
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  return (
    <Shell me={me.data}>
      <Routes>
        <Route path="/" element={<TicketsPage me={me.data} />} />
        <Route path="/tickets/:id" element={<TicketDetailPage me={me.data} />} />
        {canManageMembers(me.data.user) && (
          <Route path="/members" element={<MembersPage me={me.data} />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function Shell({ me, children }) {
  const logout = useLogout();
  const toast = useToast();
  const onOverdue = useCallback(
    (e) =>
      toast({
        tone: 'warn',
        title: `Ticket #${e.number} breached its SLA`,
        body: `No staff response yet on this ${e.priority} ticket.`,
        ttl: 10_000,
      }),
    [toast],
  );
  const live = useRealtime(me, { onOverdue });

  return (
    <>
      <header className="topbar">
        <div className="brand">SliqDesk</div>
        <span className="org">{me.org.name}</span>
        <nav>
          <NavLink to="/" end>
            Tickets
          </NavLink>
          {canManageMembers(me.user) && <NavLink to="/members">Members</NavLink>}
        </nav>
        <div className="spacer" />
        <span className={`live live-${live}`} title={`Realtime ${live}`}>
          {live === 'live' ? 'Live' : 'Offline'}
        </span>
        <span className="who">
          {me.user.name} <RoleBadge role={me.user.role} />
        </span>
        <button onClick={() => logout.mutate()}>Sign out</button>
      </header>
      <main className="content">{children}</main>
    </>
  );
}
