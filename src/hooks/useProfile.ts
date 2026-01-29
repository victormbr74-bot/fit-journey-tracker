import { useContext } from 'react';
import { useProfileContext } from '@/context/ProfileContext';

export function useProfile() {
  return useProfileContext();
}
