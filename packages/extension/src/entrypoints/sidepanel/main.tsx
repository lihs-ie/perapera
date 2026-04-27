import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanelApp } from './SidePanelApp';
import './sidepanel.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SidePanelApp />
  </React.StrictMode>,
);
