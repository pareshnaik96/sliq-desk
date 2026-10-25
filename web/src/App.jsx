import { useEffect, useState } from 'react';

// Skeleton page: proves the SPA builds and reaches the API through the /api proxy.
export function App() {
  const [health, setHealth] = useState('checking...');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setHealth(`API ${body.status}, database ${body.db}`))
      .catch(() => setHealth('API unreachable'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>SliqDesk</h1>
      <p>{health}</p>
    </main>
  );
}
