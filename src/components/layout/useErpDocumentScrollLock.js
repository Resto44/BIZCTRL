import { useLayoutEffect } from 'react';

// The ERP main element owns scrolling. A second document scroller can remain
// panned after Safari dismisses the keyboard, leaving a blank lower viewport.
export function useErpDocumentScrollLock() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-erp-document');
    root.setAttribute('data-erp-document', 'true');
    return () => {
      if (previous === null) root.removeAttribute('data-erp-document');
      else root.setAttribute('data-erp-document', previous);
    };
  }, []);
}
