import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useErpDocumentScrollLock } from './useErpDocumentScrollLock';

function Shell() {
  useErpDocumentScrollLock();
  return null;
}
afterEach(() => vi.unstubAllGlobals());

it.each([null, 'previous'])('restores document scrolling on ERP unmount (previous marker: %s)', (previous) => {
  const attributes = new Map(previous === null ? [] : [['data-erp-document', previous]]);
  vi.stubGlobal('document', { documentElement: {
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
  } });
  let tree;
  act(() => { tree = TestRenderer.create(<Shell />); });
  expect(attributes.get('data-erp-document')).toBe('true');
  act(() => tree.unmount());
  expect(attributes.get('data-erp-document') ?? null).toBe(previous);
});
