import { useState } from 'react';
import { useChangeRole, useCreateMember, useMembers, useRemoveMember } from '../api/hooks.js';
import { ErrorMessage, RoleBadge } from '../components/ui.jsx';
import { canManageMembers, ROLES } from '../lib/permissions.js';

export function MembersPage({ me }) {
  const members = useMembers();
  const changeRole = useChangeRole();
  const remove = useRemoveMember();
  const manage = canManageMembers(me.user);

  return (
    <section>
      <div className="page-head">
        <h1>Members</h1>
      </div>
      {manage && <AddMemberForm />}
      <ErrorMessage error={members.error ?? changeRole.error ?? remove.error} />
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {manage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.data?.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name} {m.id === me.user.id && <span className="muted small">(you)</span>}
                </td>
                <td className="muted">{m.email}</td>
                <td>
                  {manage ? (
                    <select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </td>
                {manage && (
                  <td className="right">
                    <button
                      className="danger"
                      onClick={() => {
                        if (window.confirm(`Remove ${m.name} from the organization?`))
                          remove.mutate(m.id);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AddMemberForm() {
  const create = useCreateMember();
  const [created, setCreated] = useState(null);

  return (
    <div className="card stack">
      <h2>Add a member</h2>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const body = Object.fromEntries(new FormData(form).entries());
          create.mutate(body, {
            onSuccess: (res) => {
              setCreated(res);
              form.reset();
            },
          });
        }}
      >
        <input name="name" placeholder="Name" required maxLength={100} aria-label="Name" />
        <input name="email" type="email" placeholder="Email" required aria-label="Email" />
        <select name="role" defaultValue="agent" aria-label="Role">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="primary" disabled={create.isPending}>
          Add
        </button>
      </form>
      <ErrorMessage error={create.error} />
      {created && (
        <div className="callout">
          <p>
            <strong>{created.member.email}</strong> can now sign in with this temporary password. It
            is shown only once, so copy it now and share it securely.
          </p>
          <code className="secret">{created.temporaryPassword}</code>
          <div className="row">
            <button onClick={() => navigator.clipboard?.writeText(created.temporaryPassword)}>
              Copy
            </button>
            <button onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
