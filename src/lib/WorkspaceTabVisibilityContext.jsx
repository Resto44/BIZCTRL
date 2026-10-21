import React, { createContext, useContext } from 'react';

// A routed ERP page remains mounted in Owner workspace tabs so filters and draft
// state survive switching tabs. Radix Dialog/Sheet portals, however, render into
// document.body, outside the inactive tab's [hidden] DOM section.
// Supply React-context visibility to every cached subtree so modal roots can
// suppress their global portal/focus trap while another tab is active.
const WorkspaceTabVisibilityContext = createContext(true);

export function WorkspaceTabVisibilityProvider({ active, children }) {
  return (
    <WorkspaceTabVisibilityContext.Provider value={Boolean(active)}>
      {children}
    </WorkspaceTabVisibilityContext.Provider>
  );
}

export function useWorkspaceTabActive() {
  return useContext(WorkspaceTabVisibilityContext);
}
