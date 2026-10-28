import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Providers } from './context';
import { NotificationProvider } from './notifications.jsx';
import './style.css';
import './refined.css';
import './polish.css';
import './cover.css';
import './motion.css';
import './product-translations.css';
import './notifications.css';
import './profile.css';
import './auth.css';
import './purchase.css';
createRoot(document.getElementById('root')).render(
  <ErrorBoundary><BrowserRouter><Providers><NotificationProvider><App /></NotificationProvider></Providers></BrowserRouter></ErrorBoundary>
);
