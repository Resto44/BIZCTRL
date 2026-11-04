import React from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkspaceTabActive } from '@/lib/WorkspaceTabVisibilityContext';

// Cached routes stay mounted. Only the visible route may change browser history.
export default function WorkspaceNavigate(props) {
  const active = useWorkspaceTabActive();
  return active ? <Navigate {...props} /> : null;
}
