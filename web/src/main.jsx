import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { setUnauthenticatedHandler } from './api/client.js';
import { keys, resetSession } from './api/hooks.js';
import { App } from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry auth/permission/not-found errors.
      retry: (count, err) => count < 2 && !(err?.status >= 400 && err?.status < 500),
      refetchOnWindowFocus: true,
    },
  },
});

// Session expired or the user was removed: drop everything and show login.
setUnauthenticatedHandler(() => {
  if (queryClient.getQueryData(keys.me) !== null) resetSession(queryClient, null);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
