import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAddComment,
  useComments,
  useMembers,
  useTicket,
  useUpdateTicket,
} from '../api/hooks.js';
import {
  ErrorMessage,
  memberName,
  PriorityBadge,
  RoleBadge,
  SlaBadge,
  StatusBadge,
  timeAgo,
} from '../components/ui.jsx';
import {
  assignableOptions,
  canComment,
  canUpdateTicket,
  label,
  PRIORITIES,
  TRANSITIONS,
} from '../lib/permissions.js';

export function TicketDetailPage({ me }) {
  const { id } = useParams();
  const ticket = useTicket(id);
  const { data: members = [] } = useMembers();

  if (ticket.isLoading) return <p className="muted">Loading…</p>;
  if (ticket.error)
    return (
      <section>
        <ErrorMessage error={ticket.error} />
        <Link to="/">Back to tickets</Link>
      </section>
    );

  const t = ticket.data;
  return (
    <section className="detail">
      <Link to="/" className="muted">
        ← All tickets
      </Link>
      <div className="detail-grid">
        <div className="stack">
          <TicketBody me={me} ticket={t} />
          <Comments me={me} ticket={t} members={members} />
        </div>
        <TicketSidebar me={me} ticket={t} members={members} />
      </div>
    </section>
  );
}

function TicketBody({ me, ticket }) {
  const update = useUpdateTicket(ticket.id);
  const [editing, setEditing] = useState(false);
  const editable = canUpdateTicket(me.user, ticket);

  if (editing)
    return (
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          update.mutate(f, { onSuccess: () => setEditing(false) });
        }}
      >
        <label>
          Title
          <input name="title" defaultValue={ticket.title} required maxLength={200} />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={ticket.description} rows={6} />
        </label>
        <ErrorMessage error={update.error} />
        <div className="row">
          <button className="primary" disabled={update.isPending}>
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="card">
      <div className="page-head">
        <h1>
          <span className="muted">#{ticket.number}</span> {ticket.title}
        </h1>
        {editable && <button onClick={() => setEditing(true)}>Edit</button>}
      </div>
      <p className="description">
        {ticket.description || <em className="muted">No description</em>}
      </p>
    </div>
  );
}

function TicketSidebar({ me, ticket, members }) {
  const update = useUpdateTicket(ticket.id);
  const editable = canUpdateTicket(me.user, ticket);
  const assignees = assignableOptions(me.user, ticket, members);
  const set = (patch) => update.mutate(patch);

  return (
    <aside className="card stack sidebar">
      <Field name="Status">
        {editable ? (
          <select value={ticket.status} onChange={(e) => set({ status: e.target.value })}>
            {[ticket.status, ...TRANSITIONS[ticket.status]].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge status={ticket.status} />
        )}
      </Field>
      <Field name="Priority">
        {editable ? (
          <select value={ticket.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <PriorityBadge priority={ticket.priority} />
        )}
      </Field>
      <Field name="Assignee">
        {assignees.length ? (
          <select
            value={ticket.assigneeId ?? ''}
            onChange={(e) => set({ assigneeId: e.target.value || null })}
          >
            {assignees.map((id) => (
              <option key={id ?? 'none'} value={id ?? ''}>
                {memberName(members, id)}
              </option>
            ))}
          </select>
        ) : (
          <span>{memberName(members, ticket.assigneeId)}</span>
        )}
      </Field>
      <Field name="SLA">
        <SlaBadge ticket={ticket} />
        {ticket.firstStaffResponseAt && (
          <span className="muted small">First response {timeAgo(ticket.firstStaffResponseAt)}</span>
        )}
        {!ticket.slaDueAt && !ticket.overdue && <span className="muted small">None</span>}
      </Field>
      <Field name="Created">
        <span className="muted small">
          {timeAgo(ticket.createdAt)} by {memberName(members, ticket.createdBy)}
        </span>
      </Field>
      {ticket.status === 'closed' && <p className="muted small">Closed tickets are read-only.</p>}
      <ErrorMessage error={update.error} />
    </aside>
  );
}

const Field = ({ name, children }) => (
  <div className="field">
    <div className="field-name">{name}</div>
    <div className="field-value">{children}</div>
  </div>
);

function Comments({ me, ticket, members }) {
  const comments = useComments(ticket.id);
  const add = useAddComment(ticket.id);
  const [body, setBody] = useState('');

  return (
    <div className="card stack">
      <h2>Conversation</h2>
      <ErrorMessage error={comments.error} />
      {comments.data?.length === 0 && <p className="muted">No comments yet.</p>}
      <ol className="comments">
        {comments.data?.map((c) => (
          <li key={c.id}>
            <div className="comment-meta">
              <strong>{memberName(members, c.authorId)}</strong> <RoleBadge role={c.authorRole} />{' '}
              <span className="muted small">{timeAgo(c.createdAt)}</span>
            </div>
            <p>{c.body}</p>
          </li>
        ))}
      </ol>
      {canComment(me.user, ticket) && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(body, { onSuccess: () => setBody('') });
          }}
        >
          <textarea
            aria-label="Comment"
            placeholder="Write a reply…"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <ErrorMessage error={add.error} />
          <div>
            <button className="primary" disabled={add.isPending || !body.trim()}>
              Comment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
