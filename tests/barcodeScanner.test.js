// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsBarcode from 'jsbarcode';
import { createBarcodeReader, normalizeBarcode, readBarcodeFrame, startBarcodeCamera } from '@/lib/barcodeScanner';

function barcodePixels(code, format) {
  const output = {};
  JsBarcode(output, code, { format, displayValue: false });
  const bars = output.encodings.map((part) => part.data).join('');
  const width = bars.length * 3 + 60, height = 120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 10; y < height - 10; y++) {
    for (let x = 30; x < width - 30; x++) {
      if (bars[Math.floor((x - 30) / 3)] !== '1') continue;
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = 0;
    }
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), getImageData: () => ({ data }) });
  return { width, height };
}

function media() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}
const callbacks = () => ({ onState: vi.fn(), onResult: vi.fn(), onError: vi.fn() });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('software barcode decoding without a native BarcodeDetector', () => {
  it.each([['BC-000000000017', 'CODE128'], ['4006381333931', 'EAN13'], ['000742', 'CODE128'], ['0036000291452', 'EAN13', '036000291452']])('reads actual %s pixels', async (code, format, expected = code) => {
    vi.stubGlobal('BarcodeDetector', undefined);
    const source = barcodePixels(code, format);
    const reader = await createBarcodeReader();
    expect(readBarcodeFrame(reader, source, document.createElement('canvas'))).toBe(expected);
  });
  it('keeps leading zeroes and converts Arabic and Persian digits without numeric coercion', () => {
    expect(normalizeBarcode(' ۰۰۰۱۲٣ ')).toBe('000123');
    expect(normalizeBarcode('000742-ABC')).toBe('000742-ABC');
  });
  it('treats an empty frame as a retry but propagates unexpected decoder errors', () => {
    const source = barcodePixels('000742', 'CODE128');
    const reader = { decodeFromCanvas: () => { throw { getKind: () => 'NotFoundException' }; } };
    expect(readBarcodeFrame(reader, source, document.createElement('canvas'))).toBeNull();
    reader.decodeFromCanvas = () => { throw new Error('broken canvas'); };
    expect(() => readBarcodeFrame(reader, source, document.createElement('canvas'))).toThrow('broken canvas');
  });
});

describe('camera lifecycle', () => {
  it('releases a permission result received after navigation without playing or decoding', async () => {
    let resolve;
    const { stream, track } = media();
    const getUserMedia = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const video = { play: vi.fn() };
    const events = callbacks();
    const session = startBarcodeCamera(video, events);
    session.stop(); resolve(stream);
    await Promise.resolve();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(events.onResult).not.toHaveBeenCalled();
    expect(events.onError).not.toHaveBeenCalled();
  });
  it('shows a permission error without throwing or disabling manual input', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } });
    const events = callbacks();
    startBarcodeCamera({}, events);
    await Promise.resolve();
    expect(events.onError).toHaveBeenCalledWith('permission');
  });
  it('releases the camera if inline video playback fails', async () => {
    const { stream, track } = media();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const events = callbacks();
    const video = { play: vi.fn().mockRejectedValue(new DOMException('Cannot play', 'NotReadableError')) };
    startBarcodeCamera(video, events);
    await Promise.resolve(); await Promise.resolve();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(events.onError).toHaveBeenCalledWith('busyCamera');
  });
  it('requests the rear camera without audio, decodes once, and stops all tracks', async () => {
    vi.useFakeTimers();
    await createBarcodeReader();
    const dimensions = barcodePixels('000742', 'CODE128');
    const { stream, track } = media();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const video = { videoWidth: dimensions.width, videoHeight: dimensions.height, play: vi.fn().mockResolvedValue() };
    const events = callbacks();
    const session = startBarcodeCamera(video, events);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }));
    expect(video.playsInline).toBe(true);
    expect(events.onResult).toHaveBeenCalledOnce();
    expect(events.onResult).toHaveBeenCalledWith('000742');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    session.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.onResult).toHaveBeenCalledOnce();
  });
});
