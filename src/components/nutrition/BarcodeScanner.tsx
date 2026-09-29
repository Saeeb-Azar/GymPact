// Vollbild-Scanner für Produkt-Barcodes (EAN/UPC) über die Rückkamera.

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createDetector, isValidProductCode } from '@/lib/barcode';
import { Button, Input } from '../ui/basics';
import { IconFlash, IconKeyboard, IconX } from '../icons';

type Status = 'starting' | 'scanning' | 'denied' | 'error';

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [torch, setTorch] = useState<boolean | null>(null); // null = nicht verfügbar
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const doneRef = useRef(false);
  const cbRef = useRef(onDetected);
  cbRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const seen = new Map<string, number>();

    const finish = (value: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(60);
      cbRef.current(value);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        if (caps.torch) setTorch(false);

        const detector = await createDetector();
        if (cancelled) return;
        setStatus('scanning');

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          if (video.readyState >= 2) {
            try {
              const value = await detector.detect(video);
              if (value) {
                // Gültige Prüfziffer → sofort; sonst erst nach 3 gleichen Treffern
                const n = (seen.get(value) ?? 0) + 1;
                seen.set(value, n);
                if (isValidProductCode(value) || n >= 3) return finish(value);
              }
            } catch {
              // einzelne Frames dürfen fehlschlagen
            }
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const submitManual = () => {
    const c = code.replace(/\D/g, '');
    if (c.length >= 8) {
      doneRef.current = true;
      onDetected(c);
    }
  };

  const showManual = manual || status === 'denied' || status === 'error';

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scannen"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Abdunklung mit Aussparung */}
      {!showManual && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="relative aspect-[1.6] w-[78%] max-w-sm rounded-3xl"
            style={{ boxShadow: '0 0 0 100vmax rgba(0,0,0,0.55)' }}
          >
            {[
              'left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl',
              'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl',
              'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl',
              'right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl',
            ].map((c) => (
              <span key={c} className={`absolute h-8 w-8 border-brand-400 ${c}`} />
            ))}
            {status === 'scanning' && (
              <motion.span
                className="absolute inset-x-4 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px_rgba(46,227,157,0.8)]"
                initial={{ top: '12%' }}
                animate={{ top: ['12%', '88%', '12%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
        </div>
      )}

      {/* Kopfzeile */}
      <div
        className="relative flex items-center justify-between px-4"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur"
          aria-label="Scanner schließen"
        >
          <IconX size={22} />
        </button>
        {torch !== null && !showManual && (
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur ${
              torch ? 'bg-brand-400 text-surface-950' : 'bg-black/50'
            }`}
            aria-label={torch ? 'Licht aus' : 'Licht an'}
            aria-pressed={torch}
          >
            <IconFlash size={20} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* Fußbereich */}
      <div
        className="relative space-y-3 px-5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
      >
        {showManual ? (
          <div className="mx-auto w-full max-w-sm space-y-3 rounded-3xl bg-surface-900/95 p-5 backdrop-blur">
            <p className="font-display text-lg font-bold">Barcode eingeben</p>
            {status === 'denied' && (
              <p className="text-sm text-white/70">
                Kein Kamerazugriff. Erlaube die Kamera in den Einstellungen deines Browsers oder tippe die Nummer
                unter dem Barcode ein.
              </p>
            )}
            {status === 'error' && (
              <p className="text-sm text-white/70">Die Kamera ist hier nicht verfügbar. Tippe die Nummer ein.</p>
            )}
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 4006381333931"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              className="text-center font-display text-xl tracking-widest"
            />
            <Button className="w-full" disabled={code.replace(/\D/g, '').length < 8} onClick={submitManual}>
              Produkt suchen
            </Button>
            {status === 'scanning' && (
              <button type="button" onClick={() => setManual(false)} className="w-full py-1 text-sm text-white/70">
                Zurück zur Kamera
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-center text-sm text-white/85">
              {status === 'starting' ? 'Kamera wird gestartet …' : 'Barcode in den Rahmen halten'}
            </p>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="mx-auto flex items-center gap-2 rounded-full bg-black/50 px-4 py-2.5 text-sm font-semibold backdrop-blur"
            >
              <IconKeyboard size={18} /> Nummer eintippen
            </button>
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
