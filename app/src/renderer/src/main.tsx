import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// CSS global antes das telas: base (styles.css), depois a linguagem comum (ui.css) e por
// último o CSS de cada tela (landing.css, shell.css), que pode sobrescrever os dois.
import './styles.css';
import './ui.css';
import { App } from './App';
import './i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
