import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogin, useSignup } from '../api/hooks.js';
import { ErrorMessage } from '../components/ui.jsx';

function AuthCard({ title, children, footer }) {
  return (
    <main className="auth">
      <div className="card auth-card">
        <div className="brand brand-lg">SliqDesk</div>
        <h1>{title}</h1>
        {children}
        <p className="muted">{footer}</p>
      </div>
    </main>
  );
}

const fieldsFrom = (form) => Object.fromEntries(new FormData(form).entries());

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New here? <Link to="/signup">Create an organization</Link>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(fieldsFrom(e.currentTarget), { onSuccess: () => navigate('/') });
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <ErrorMessage error={login.error} />
        <button className="primary" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}

export function SignupPage() {
  const signup = useSignup();
  const navigate = useNavigate();
  const [mismatch, setMismatch] = useState(false);
  return (
    <AuthCard
      title="Create your organization"
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const { confirm, ...body } = fieldsFrom(e.currentTarget);
          setMismatch(confirm !== body.password);
          if (confirm === body.password) signup.mutate(body, { onSuccess: () => navigate('/') });
        }}
      >
        <label>
          Organization name
          <input name="orgName" required maxLength={100} />
        </label>
        <label>
          Your name
          <input name="name" autoComplete="name" required maxLength={100} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" required />
        </label>
        {mismatch && <div className="error">Passwords do not match</div>}
        <ErrorMessage error={signup.error} />
        <button className="primary" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </AuthCard>
  );
}
