// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WorkspaceTabVisibilityProvider,
  useWorkspaceTabActive,
} from '../src/lib/WorkspaceTabVisibilityContext';

const source = (file) => readFile(new URL(file, import.meta.url), 'utf8');
let renderer;
afterEach(() => { if (renderer) act(() => renderer.unmount()); renderer = null; });

function VisibleFlag() {
  return <span data-testid="active-owner-tab">{String(useWorkspaceTabActive())}</span>;
}

describe('Owner cached tabs must not leak Dish & recipe Dialog to Purchase Invoice', () => {
  it('updates context as the selected Owner tab changes without unmounting the page component', () => {
    function TabPanel({ active }) {
      return <WorkspaceTabVisibilityProvider active={active}><VisibleFlag /></WorkspaceTabVisibilityProvider>;
    }
    act(() => { renderer = create(<TabPanel active />); });
    const active = () => renderer.root.findByProps({ 'data-testid': 'active-owner-tab' }).children.join('');
    expect(active()).toBe('true');
    act(() => renderer.update(<TabPanel active={false} />));
    expect(active()).toBe('false');
    act(() => renderer.update(<TabPanel active />));
    expect(active()).toBe('true');
  });

  it('masks only the restaurant Dish & recipe dialog on inactive tabs while keeping its draft state above the modal', async () => {
    const [tabs, editor, productWorkspace] = await Promise.all([
      source('../src/components/layout/OwnerWorkspaceTabs.jsx'),
      source('../src/pages/restaurant/RestaurantPOS.jsx'),
      source('../src/components/restaurant-pos/RestaurantProductWorkspace.jsx'),
    ]);
    expect(tabs).toContain('<WorkspaceTabVisibilityProvider active={tab.path === activePath}>');
    expect(tabs).toContain('hidden={tab.path !== activePath}');
    expect(editor).toContain('const workspaceTabActive=useWorkspaceTabActive()');
    expect(editor).toContain('open={workspaceTabActive}');
    expect(editor).toContain('workspaceTabActive)close()');
    const draft = editor.indexOf('const [form,setForm]=useState');
    const modal = editor.indexOf('open={workspaceTabActive}');
    expect(draft).toBeGreaterThan(0);
    expect(modal).toBeGreaterThan(draft);
    expect(productWorkspace).toContain('editing&&branch&&manage&&!raw&&<Setup');
  });

  it('leaves Purchase Invoice dialog and other financial forms unmodified to avoid silently losing unsaved data', async () => {
    const [purchase, dialog, alertDialog, sheet] = await Promise.all([
      source('../src/pages/Purchases.jsx'),
      source('../src/components/ui/dialog.jsx'),
      source('../src/components/ui/alert-dialog.jsx'),
      source('../src/components/ui/sheet.jsx'),
    ]);
    expect(purchase).toContain('<Dialog open={showForm}');
    expect(purchase).toContain('setShowForm(false); setEditing(null);');
    expect(dialog).toContain('const Dialog = DialogPrimitive.Root');
    expect(alertDialog).toContain('const AlertDialog = AlertDialogPrimitive.Root');
    expect(sheet).toContain('const Sheet = SheetPrimitive.Root');
  });
});
