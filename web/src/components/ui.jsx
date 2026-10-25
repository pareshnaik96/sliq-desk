import { label } from '../lib/permissions.js';

export const StatusBadge = ({ status }) => (
  <span className={`badge status-${status}`}>{label(status)}</span>
);

export const PriorityBadge = ({ priority }) => (
  <span className={`badge priority-${priority}`}>{priority}</span>
);

export const RoleBadge = ({ role }) => <span className={`badge role-${role}`}>{role}</span>;

/** SLA state for tickets that have a deadline. */
export function SlaBadge({ ticket }) {
  if (ticket.overdue) return <span className="badge sla-overdue">SLA breached</span>;
  if (!ticket.slaDueAt || ticket.firstStaffResponseAt) return null;
  if (ticket.status === 'resolved' || ticket.status === 'closed') return null;
  return (
    <span className="badge sla-pending" title={new Date(ticket.slaDueAt).toLocaleString()}>
      SLA {timeUntil(ticket.slaDueAt)}
    </span>
  );
}

export function ErrorMessage({ error }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      {error.message}
      {Array.isArray(error.details) && (
        <ul>
          {error.details.map((d, i) => (
            <li key={i}>
              {d.path ? `${d.path}: ` : ''}
              {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function timeUntil(date) {
  const mins = Math.round((new Date(date).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return 'due now';
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
}

export function timeAgo(date) {
  const secs = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

export const memberName = (members, id) => {
  if (!id) return 'Unassigned';
  return members?.find((m) => m.id === id)?.name ?? 'Former member';
};
