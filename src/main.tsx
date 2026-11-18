import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { setBlobSource } from '@/engines/rendering/assets';
import { assetsRepo } from '@/db/repositories/assets';

setBlobSource((id) => assetsRepo.getBlob(id));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
