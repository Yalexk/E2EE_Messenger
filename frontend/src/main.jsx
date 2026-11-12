import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-center"
        toastOptions={{ style: { background: 'var(--color-paper-2)', color: 'var(--color-ink)', border: '1px solid var(--color-rule)', borderRadius: 0 } }}
      />
    </BrowserRouter>
  </StrictMode>,
);
