// Lazy-load the software decoder so scanning also works without BarcodeDetector
// (including iPhone browsers), without adding it to the dashboard's first load.
let decoderModule;
export async function createBarcodeReader() {
  decoderModule ||= import('@zxing/browser').catch((error) => { decoderModule = null; throw error; });
  const { BrowserMultiFormatReader } = await decoderModule;
  return new BrowserMultiFormatReader();
}

export function normalizeBarcode(value) {
  return String(value ?? '').trim().replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)));
}

export function readBarcodeFrame(reader, source, canvas) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return null;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return normalizeBarcode(reader.decodeFromCanvas(canvas).getText()) || null;
  } catch (error) {
    // getKind is stable in minified builds; constructor.name is not.
    if (['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.getKind?.())) return null;
    throw error;
  }
}

function cameraError(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)) return 'permission';
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(error.name)) return 'noCamera';
  if (['NotReadableError', 'TrackStartError'].includes(error.name)) return 'busyCamera';
  return 'cameraError';
}

// Return a stop handle synchronously: a permission prompt can resolve long after
// the dialog closes or a cached workspace tab becomes inactive.
export function startBarcodeCamera(video, { onResult, onError, onState }) {
  let stopped = false;
  let stream;
  let timer;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => { track.removeEventListener('ended', ended); track.stop(); });
    if (video.srcObject === stream) video.srcObject = null;
    stream = null;
  };
  const fail = (key) => { if (stopped) return; stop(); onError(key); };
  const ended = () => fail('cameraError');
  const start = async () => {
    if (globalThis.isSecureContext === false) return fail('secure');
    if (!navigator.mediaDevices?.getUserMedia) return fail('unavailable');
    onState('starting');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (stopped) { acquired.getTracks().forEach((track) => track.stop()); return; }
      stream = acquired;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', ended));
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
    } catch (error) { fail(cameraError(error)); return; }
    if (stopped) return;
    let reader;
    try { reader = await createBarcodeReader(); } catch { fail('decoderError'); return; }
    if (stopped) return;
    onState('scanning');
    const canvas = document.createElement('canvas');
    const scan = () => {
      if (stopped) return;
      try {
        const code = readBarcodeFrame(reader, video, canvas);
        if (code) { stop(); onResult(code); return; }
      } catch { fail('cameraError'); return; }
      timer = setTimeout(scan, 300);
    };
    scan();
  };
  void start();
  return { stop };
}

export async function decodeBarcodePhoto(file, signal) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  let abort;
  try {
    await new Promise((resolve, reject) => {
      abort = () => reject(new DOMException('Cancelled', 'AbortError'));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = resolve;
      image.onerror = () => reject(new Error('Image could not be opened'));
      image.src = url;
    });
    const reader = await createBarcodeReader();
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return readBarcodeFrame(reader, image, document.createElement('canvas'));
  } finally {
    signal?.removeEventListener('abort', abort);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
