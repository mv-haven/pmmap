import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Landing from './Landing.jsx';
import './styles.css';

// `/` is the marketing landing; the board lives at `/app` (which resolves the
// default map and redirects to `/map/:id`) and at shareable `/map/:id` links.
const path = window.location.pathname;
const isBoard = path === '/app' || path.startsWith('/map/');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{isBoard ? <App /> : <Landing />}</React.StrictMode>
);
