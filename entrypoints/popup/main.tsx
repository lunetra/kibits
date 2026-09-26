import '@fontsource-variable/inter';
import '@fontsource-variable/vazirmatn';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/src/popup/App';
import '@/src/popup/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
