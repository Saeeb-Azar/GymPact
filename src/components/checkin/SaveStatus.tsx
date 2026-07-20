import type { SaveStatus } from '@/hooks/useCheckinManager';
import { Spinner } from '../ui/basics';
import { IconCheck } from '../icons';

/** Dezente Speicher-Anzeige neben der Check-in-Überschrift. */
export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-surface-900/50 dark:text-surface-100/50'
      }`}
    >
      {status === 'saving' && (
        <>
          <Spinner className="h-3 w-3" /> Speichert…
        </>
      )}
      {status === 'saved' && (
        <>
          <IconCheck size={14} /> Gespeichert
        </>
      )}
      {status === 'error' && 'Speichern fehlgeschlagen – erneut versuchen'}
    </span>
  );
}
