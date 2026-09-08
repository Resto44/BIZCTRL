// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BarcodeScanDialog from '@/components/shared/BarcodeScanDialog';
import { decodeBarcodePhoto } from '@/lib/barcodeScanner';

const state = vi.hoisted(() => ({ sessions: [], lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: state.lang }) }));
vi.mock('@/lib/barcodeScanner', async (original) => ({
  ...(await original()),
  decodeBarcodePhoto: vi.fn(),
  startBarcodeCamera: vi.fn((video, events) => { const session = { events, stop: vi.fn() }; state.sessions.push(session); return session; }),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const detected = vi.fn(), parentSubmit = vi.fn();
function Harness() {
  const [open, setOpen] = useState(true);
  return <MemoryRouter initialEntries={['/inventory']}><Link to="/inventory/operations">Operations</Link><form onSubmit={parentSubmit}><BarcodeScanDialog open={open} onOpenChange={setOpen} onScan={detected} /></form><button onClick={() => setOpen(true)}>Scan again</button></MemoryRouter>;
}
async function click(el) { expect(el).toBeTruthy(); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))); }
async function render() { await act(async () => root.render(<Harness />)); }
beforeEach(() => { state.sessions = []; state.lang = 'en'; detected.mockClear(); parentSubmit.mockClear(); vi.mocked(decodeBarcodePhoto).mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('barcode scanner dialog', () => {
  it('keeps manual / hardware entry usable after camera denial without submitting the product form', async () => {
    await render();
    await act(async () => state.sessions.at(-1).events.onError('permission'));
    expect(document.querySelector('[role="alert"]').textContent).toContain('Allow it in your browser settings');
    const input = document.querySelector('#scanner-barcode');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '۰۰۰۷۴۲');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(detected).toHaveBeenCalledWith('000742');
    expect(parentSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(state.sessions[0].stop).toHaveBeenCalled();
    await click([...container.querySelectorAll('button')].find((el) => el.textContent === 'Scan again'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(state.sessions).toHaveLength(2);
  });
  it('pauses the camera in the background and starts a fresh session only on request', async () => {
    await render(); const first = state.sessions.at(-1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(first.stop).toHaveBeenCalled();
    expect(document.querySelector('[role="status"]').textContent).toBe('Camera stopped');
    await click([...document.querySelectorAll('[role="dialog"] button')].find((el) => el.textContent === 'Open camera'));
    expect(state.sessions.at(-1)).not.toBe(first);
  });
  it('unmounts the camera when a still-mounted workspace changes routes', async () => {
    await render(); const session = state.sessions.at(-1);
    await click(container.querySelector('a'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(session.stop).toHaveBeenCalled();
  });
  it('accepts a barcode photo and stops the live camera before decoding', async () => {
    vi.mocked(decodeBarcodePhoto).mockResolvedValue('000991');
    await render();
    const session = state.sessions.at(-1), file = new File(['barcode'], 'barcode.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(decodeBarcodePhoto).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(session.stop).toHaveBeenCalled();
    expect(detected).toHaveBeenCalledWith('000991');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('cancels a photo still being decoded after closing, without emitting an old result', async () => {
    let resolve;
    vi.mocked(decodeBarcodePhoto).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render();
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['barcode'], 'barcode.png', { type: 'image/png' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    const signal = vi.mocked(decodeBarcodePhoto).mock.calls[0][1];
    await click([...document.querySelectorAll('[role="dialog"] button')].find((el) => el.textContent === 'Close'));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve('000991'));
    expect(detected).not.toHaveBeenCalled();
  });
  it('renders readable Persian controls and error guidance', async () => {
    state.lang = 'fa'; await render();
    await act(async () => state.sessions.at(-1).events.onError('permission'));
    expect(document.querySelector('[role="dialog"] [dir="rtl"]')).toBeTruthy();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('اسکن بارکد');
    expect(document.querySelector('[role="alert"]').textContent).toContain('اجازهٔ کمره داده نشد');
  });
});
