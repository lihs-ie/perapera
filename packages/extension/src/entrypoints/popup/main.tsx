import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './popup.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
