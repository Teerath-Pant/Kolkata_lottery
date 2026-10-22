import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './lib/auth';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 3000, refetchOnWindowFocus: true, retry: 1 } } });

// No <React.StrictMode>: in dev it mounts every component twice, which replays animations and doubles effects.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ToastProvider>
          <AuthProvider>
            <MotionConfig reducedMotion="user">
              <App />
            </MotionConfig>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </>,
);
