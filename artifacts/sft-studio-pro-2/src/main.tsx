import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ClerkRoot from './ClerkRoot.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkRoot />
  </StrictMode>,
);
