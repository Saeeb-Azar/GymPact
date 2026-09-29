// Barcode-Erkennung: nativer BarcodeDetector (Chrome/Android), sonst
// ZXing-WebAssembly (iPhone/Safari). Die WASM-Datei wird selbst gehostet
// und erst beim ersten Scan geladen.

export const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Detector {
  detect(source: HTMLVideoElement): Promise<string | null>;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}
interface NativeDetectorCtor {
  new (opts: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Prüfziffer von EAN-8/EAN-13/UPC-A (verhindert Fehlerkennungen). */
export function isValidProductCode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? [];
      if (supported.includes('ean_13')) {
        const det = new Native({ formats: PRODUCT_FORMATS.filter((f) => supported.includes(f)) });
        return {
          detect: async (v) => (await det.detect(v))[0]?.rawValue ?? null,
        };
      }
    } catch {
      // weiter mit ZXing
    }
  }

  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  });
  const det = new BarcodeDetector({ formats: [...PRODUCT_FORMATS] });
  return {
    detect: async (v) => (await det.detect(v))[0]?.rawValue ?? null,
  };
}
