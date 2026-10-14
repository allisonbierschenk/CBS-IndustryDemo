import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { SessionProvider } from './context/SessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { WhyTableauProvider } from './context/WhyTableauContext.jsx';
import './styles/app.css';

// No <StrictMode>: in development it runs every effect twice, which doubled API calls, minted two
// Tableau tokens and signed in to Tableau twice per embed. Production was never affected.
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <WhyTableauProvider>
            <App />
          </WhyTableauProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </ErrorBoundary>
);
