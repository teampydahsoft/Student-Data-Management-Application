import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './config/queryClient';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Expose React and process globally for Pydah AI UMD bundle compatibility
if (typeof window !== 'undefined') {
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.process = window.process || { env: { NODE_ENV: 'production' } };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
