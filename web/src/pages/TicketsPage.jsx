import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCreateTicket, useMembers, useTickets } from '../api/hooks.js';
import {
  ErrorMessage,
  memberName,
  PriorityBadge,
  SlaBadge,
  StatusBadge,
  timeAgo,
} from '../components/ui.jsx';
import { canCreateTicket, label, PRIORITIES, STATUSES } from '../lib/permissions.js';

const FILTERS = ['status', 'priority', 'assignee'];

export function TicketsPage({ me }) {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTERS.map((f) => [f, params.get(f) ?? '']));
  const tickets = useTickets(filters);
  const { data: members = [] } = useMembers();
  const [creating, setCreating] = useState(false);

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const items = tickets.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section>
      <div className="page-head">
        <h1>Tickets</h1>
        {canCreateTicket(me.user) && (
          <button className="primary" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Cancel' : 'New ticket'}
          </button>
        )}
      </div>

      {creating && <NewTicketForm me={me} members={members} onDone={() => setCreating(false)} />}

      <div className="filters">
        <select
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          value={filters.priority}
          onChange={(e) => setFilter('priority', e.target.value)}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Assignee"
          value={filters.assignee}
          onChange={(e) => setFilter('assignee', e.target.value)}
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {members
            .filter((m) => m.role !== 'viewer')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>

      <ErrorMessage error={tickets.error} />

      <div className="card table-card">
        <table className="tickets">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className={t.overdue ? 'row-overdue' : undefined}>
                <td className="num">{t.number}</td>
                <td>
                  <Link to={`/tickets/${t.id}`}>{t.title}</Link> <SlaBadge ticket={t} />
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                <td>{memberName(members, t.assigneeId)}</td>
                <td className="muted">{timeAgo(t.createdAt)}</td>
              </tr>
            ))}
            {!tickets.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No tickets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tickets.hasNextPage && (
        <div className="center">
          <button onClick={() => tickets.fetchNextPage()} disabled={tickets.isFetchingNextPage}>
            {tickets.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}

function NewTicketForm({ me, members, onDone }) {
  const create = useCreateTicket();
  const assignable =
    me.user.role === 'admin' ? members.filter((m) => m.role !== 'viewer') : [me.user];

  return (
    <form
      className="card stack new-ticket"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget).entries());
        create.mutate(
          {
            title: f.title,
            description: f.description,
            priority: f.priority,
            ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
          },
          { onSuccess: onDone },
        );
      }}
    >
      <label>
        Title
        <input name="title" required maxLength={200} autoFocus />
      </label>
      <label>
        Description
        <textarea name="description" rows={4} maxLength={10000} />
      </label>
      <div className="row">
        <label>
          Priority
          <select name="priority" defaultValue="medium">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select name="assigneeId" defaultValue="">
            <option value="">Unassigned</option>
            {assignable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        High and urgent tickets start an SLA clock for a first staff response.
      </p>
      <ErrorMessage error={create.error} />
      <div>
        <button className="primary" disabled={create.isPending}>
          Create ticket
        </button>
      </div>
    </form>
  );
}
