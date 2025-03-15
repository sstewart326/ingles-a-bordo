import { useContext } from 'react';
import MasqueradeContext from '../contexts/MasqueradeContext';

export const useMasquerade = () => {
  const context = useContext(MasqueradeContext);
  if (!context) {
    throw new Error('useMasquerade must be used within a MasqueradeProvider');
  }
  return context;
}; 