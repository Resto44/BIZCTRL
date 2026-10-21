// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const primitiveParts = async () => {
  const { default: React } = await import('react');
  const Part = React.forwardRef(({ children, ...props }, ref) =>
    React.createElement('div', { ...props, ref }, children));
  Part.displayName = 'MockRadixPart';
  const Root = ({ open, onOpenChange, children }) => (
    <div data-modal-root="true" data-open={String(open)} data-can-change={String(Boolean(onOpenChange))}>
      {children}
    </div>
  );
  return {
    Root,
    Trigger: Part,
    Portal: Part,
    Close: Part,
    Overlay: Part,
    Content: Part,
    Title: Part,
    Description: Part,
    Action: Part,
    Cancel: Part,
  };
};
vi.mock('@radix-ui/react-dialog', primitiveParts);
vi.mock('@radix-ui/react-alert-dialog', primitiveParts);

import { WorkspaceTabVisibilityProvider } from '../src/lib/WorkspaceTabVisibilityContext';
import { Dialog } from '../src/components/ui/dialog';
import { AlertDialog } from '../src/components/ui/alert-dialog';
import { Sheet } from '../src/components/ui/sheet';

let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; });

function CachedOwnerTab({ active, onOpenChange }) {
  return (
    <WorkspaceTabVisibilityProvider active={active}>
      <Dialog open onOpenChange={onOpenChange}><span>Dish &amp; recipe draft</span></Dialog>
      <AlertDialog open onOpenChange={onOpenChange}><span>Delete warning draft</span></AlertDialog>
      <Sheet open onOpenChange={onOpenChange}><span>Side-panel draft</span></Sheet>
    </WorkspaceTabVisibilityProvider>
  );
}

describe('Owner workspace cached modal lifecycle', () => {
  it('closes every global portal when tab is inactive and restores on return without calling onOpenChange', () => {
    const onOpenChange = vi.fn();
    act(() => { tree = create(<CachedOwnerTab active onOpenChange={onOpenChange} />); });
    const roots = () => tree.root.findAllByProps({ 'data-modal-root': 'true' });
    expect(roots().map(root => root.props['data-open'])).toEqual(['true', 'true', 'true']);
    expect(roots().map(root => root.props['data-can-change'])).toEqual(['true', 'true', 'true']);

    // Open the purchase-invoice tab while the menu editor is still open in
    // the cached Product Management tab. Its portal/focus trap must disappear.
    act(() => { tree.update(<CachedOwnerTab active={false} onOpenChange={onOpenChange} />); });
    expect(roots().map(root => root.props['data-open'])).toEqual(['false', 'false', 'false']);
    expect(roots().map(root => root.props['data-can-change'])).toEqual(['false', 'false', 'false']);
    expect(onOpenChange).not.toHaveBeenCalled();

    act(() => { tree.update(<CachedOwnerTab active onOpenChange={onOpenChange} />); });
    expect(roots().map(root => root.props['data-open'])).toEqual(['true', 'true', 'true']);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps dialogs outside Owner tabs working without any workspace provider', () => {
    act(() => { tree = create(<Dialog open><span>Standalone dialog</span></Dialog>); });
    const root = tree.root.findByProps({ 'data-modal-root': 'true' });
    expect(root.props['data-open']).toBe('true');
  });
});
