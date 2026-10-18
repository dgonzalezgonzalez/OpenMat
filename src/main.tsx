import React from 'react';
import ReactDOM from 'react-dom/client';
import { OpenMatApp } from './ui/OpenMatApp';
import './styles/matlab-theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenMatApp />
  </React.StrictMode>
);
