// Barcode scanner, loaded only when opened (the decoder is ~1 MB of WebAssembly). Uses the browser's own
// BarcodeDetector where it exists and ZXing in WebAssembly elsewhere (Safari), served from this app.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The default would fetch the decoder from a CDN, which the content security policy doesn't allow.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export default function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [detector] = useState(() => new BarcodeDetector({ formats: [...FORMATS] }));
  const [message, setMessage] = useState('Starting the camera…');
  const [live, setLive] = useState(false);
  // The camera starts once per open; the latest callbacks are read through a ref instead of restarting it.
  const handlers = useRef({ onCode, onClose });
  handlers.current = { onCode, onClose };

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const scan = async () => {
      if (stopped) return;
      try {
        const [hit] = await detector.detect(video.current!);
        if (hit && !stopped) {
          navigator.vibrate?.(40);
          handlers.current.onCode(hit.rawValue);
          return;
        }
      } catch {
        // A frame that can't be read yet; try the next one.
      }
      timer = setTimeout(scan, 200);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((track) => track.stop());
        video.current!.srcObject = s;
        await video.current!.play();
        setLive(true);
        setMessage('Point the camera at the barcode');
        scan();
      })
      .catch(() => setMessage('No camera access here. Take a photo of the barcode instead.'));
    if (!navigator.mediaDevices) setMessage('No camera access here. Take a photo of the barcode instead.');
    // A permission prompt left unanswered, or a camera that never starts: point at the fallback.
    const slow = setTimeout(() => !stopped && !stream && setMessage('Camera not starting? Take a photo of the barcode instead.'), 6000);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && handlers.current.onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(slow);
      stream?.getTracks().forEach((track) => track.stop());
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setMessage('Reading the photo…');
    try {
      const [hit] = await detector.detect(await createImageBitmap(file));
      if (hit) return handlers.current.onCode(hit.rawValue);
      setMessage("Couldn't find a barcode in that photo. Try again, closer and in focus.");
    } catch {
      setMessage("Couldn't read that photo. Try again.");
    }
  };

  return createPortal(
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <video ref={video} playsInline muted autoPlay className={live ? 'live' : ''} />
      <div className="scanner-frame" aria-hidden />
      <p className="scanner-message" role="status">
        {message}
      </p>
      <div className="scanner-actions">
        <label className="button">
          Take a photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromPhoto(e.target.files?.[0])} />
        </label>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
