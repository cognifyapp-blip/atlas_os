import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  ?? import.meta.env.CLERK_PUBLISHABLE_KEY;

// If no Clerk key is configured, render the app without auth
// (dev mode without Clerk, or misconfiguration)
if (!PUBLISHABLE_KEY) {
  console.warn('[Atlas] VITE_CLERK_PUBLISHABLE_KEY not set — running without Clerk auth.');
}

const root = createRoot(document.getElementById('root')!);

if (PUBLISHABLE_KEY) {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
