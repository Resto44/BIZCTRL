// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { primitiveParts } = vi.hoisted(() => ({ primitiveParts: async () => {
  const { default: React } = await import('react');
  const Part = React.forwardRef(({ children, ...props }, ref) =>
    React.createElement('div', { ...props, ref }, children));
  Part.displayName = 'MockRadixPart';
  const Root = ({ open, onOpenChange, children }) =>
    React.createElement('div', {
      'data-modal-root': 'true',
      'data-open': String(open),
      'data-can-change': String(Boolean(onOpenChange)),
    }, children);
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
} }));
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

  it('does not reveal Dish & recipe after the Add Purchase invoice is closed on a different tab', () => {
    function CachedProductAndPurchase({ currentTab, invoiceOpen }) {
      return <>
        <WorkspaceTabVisibilityProvider active={currentTab === 'product'}>
          <Dialog open><span>Dish & recipe</span></Dialog>
        </WorkspaceTabVisibilityProvider>
        <WorkspaceTabVisibilityProvider active={currentTab === 'purchases'}>
          <Dialog open={invoiceOpen}><span>Purchase Invoice</span></Dialog>
        </WorkspaceTabVisibilityProvider>
      </>;
    }
    const openStates = () => tree.root.findAllByProps({ 'data-modal-root': 'true' })
      .map(root => root.props['data-open']);
    act(() => { tree = create(<CachedProductAndPurchase currentTab="product" invoiceOpen={false} />); });
    expect(openStates()).toEqual(['true', 'false']);
    act(() => { tree.update(<CachedProductAndPurchase currentTab="purchases" invoiceOpen />); });
    expect(openStates()).toEqual(['false', 'true']);
    act(() => { tree.update(<CachedProductAndPurchase currentTab="purchases" invoiceOpen={false} />); });
    expect(openStates()).toEqual(['false', 'false']);
  });

  it('keeps dialogs outside Owner tabs working without any workspace provider', () => {
    act(() => { tree = create(<Dialog open><span>Standalone dialog</span></Dialog>); });
    const root = tree.root.findByProps({ 'data-modal-root': 'true' });
    expect(root.props['data-open']).toBe('true');
  });
});
