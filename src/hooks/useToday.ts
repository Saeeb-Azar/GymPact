import { useEffect, useState } from 'react';
import { localDateString, deviceTimezone, type DateString } from '@/lib/dates';
import { useProfile } from './queries';

/**
 * Das "heutige" Datum in der Zeitzone des Nutzers.
 * Aktualisiert sich automatisch beim Tageswechsel (Prüfung jede Minute).
 */
export function useToday(): DateString {
  const { data: profile } = useProfile();
  const timezone = profile?.timezone ?? deviceTimezone();
  const [today, setToday] = useState<DateString>(() => localDateString(timezone));

  useEffect(() => {
    setToday(localDateString(timezone));
    const interval = window.setInterval(() => {
      setToday((prev) => {
        const next = localDateString(timezone);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [timezone]);

  return today;
}
