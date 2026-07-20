// Auto-Save-Logik für den Tages-Check-in: Booleans speichern sofort,
// numerische Werte, Gewicht und Notiz mit kurzem Debounce.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import {
  queryKeys,
  useMyCheckin,
  type ChallengeWithHabits,
  type CheckinWithEntries,
} from './queries';
import type { HabitRow } from '@/lib/database.types';
import type { DateString } from '@/lib/dates';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 700;

export interface CheckinManager {
  isLoading: boolean;
  saveStatus: SaveStatus;
  /** Gewohnheits-Werte (nach Server-Stand plus optimistische Updates) */
  booleanValue: (habit: HabitRow) => boolean;
  numericValue: (habit: HabitRow) => string;
  isCompleted: (habit: HabitRow) => boolean;
  weight: string;
  note: string;
  completedCount: number;
  totalCount: number;
  ratio: number;
  toggleHabit: (habit: HabitRow, next: boolean) => void;
  setNumericValue: (habit: HabitRow, raw: string) => void;
  setWeight: (raw: string) => void;
  setNote: (raw: string) => void;
}

export function useCheckinManager(
  challenge: ChallengeWithHabits | null | undefined,
  date: DateString,
): CheckinManager {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const challengeId = challenge?.id;
  const { data: checkin, isLoading } = useMyCheckin(challengeId, date);

  // Drafts für Eingabefelder (Strings, damit Tippen nicht springt)
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
  const [weightDraft, setWeightDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const [pending, setPending] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  const timers = useRef<Record<string, number>>({});
  const checkinRef = useRef<CheckinWithEntries | null>(null);
  const ensurePromise = useRef<Promise<CheckinWithEntries> | null>(null);

  checkinRef.current = checkin ?? checkinRef.current;

  // Bei Tages- oder Challenge-Wechsel alle Drafts zurücksetzen
  useEffect(() => {
    setNumericDrafts({});
    setWeightDraft(null);
    setNoteDraft(null);
    setHasError(false);
    setSavedOnce(false);
    checkinRef.current = null;
    ensurePromise.current = null;
    const currentTimers = timers.current;
    Object.values(currentTimers).forEach((t) => window.clearTimeout(t));
    timers.current = {};
  }, [challengeId, date]);

  const queryKey = useMemo(
    () => queryKeys.checkin(challengeId ?? 'none', user?.id ?? 'anon', date),
    [challengeId, user?.id, date],
  );

  const updateCache = useCallback(
    (updater: (prev: CheckinWithEntries) => CheckinWithEntries) => {
      queryClient.setQueryData<CheckinWithEntries | null>(queryKey, (prev) =>
        prev ? updater(prev) : prev,
      );
    },
    [queryClient, queryKey],
  );

  /** Check-in-Zeile anlegen, falls noch keine existiert (einmalig, race-sicher). */
  const ensureCheckin = useCallback(async (): Promise<CheckinWithEntries> => {
    const existing = checkinRef.current;
    if (existing) return existing;
    if (ensurePromise.current) return ensurePromise.current;

    ensurePromise.current = (async () => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .upsert(
          { challenge_id: challengeId!, user_id: user!.id, date },
          { onConflict: 'challenge_id,user_id,date' },
        )
        .select('*, habit_entries(*)')
        .single();
      if (error) throw error;
      const row = data as unknown as CheckinWithEntries;
      row.habit_entries = row.habit_entries ?? [];
      checkinRef.current = row;
      queryClient.setQueryData(queryKey, row);
      return row;
    })();

    try {
      return await ensurePromise.current;
    } catch (err) {
      ensurePromise.current = null; // erneuten Versuch erlauben
      throw err;
    }
  }, [challengeId, user, date, queryClient, queryKey]);

  const runSave = useCallback(
    async (work: () => Promise<void>) => {
      setPending((p) => p + 1);
      setHasError(false);
      try {
        await work();
        setSavedOnce(true);
        if (challengeId) {
          queryClient.invalidateQueries({
            queryKey: ['group-checkins', challengeId],
          });
        }
      } catch (err) {
        console.error('Speichern fehlgeschlagen:', err);
        setHasError(true);
      } finally {
        setPending((p) => p - 1);
      }
    },
    [challengeId, queryClient],
  );

  const saveEntry = useCallback(
    async (habit: HabitRow, value: { boolean?: boolean; numeric?: number | null }) => {
      const row = await ensureCheckin();
      const { data, error } = await supabase
        .from('habit_entries')
        .upsert(
          {
            checkin_id: row.id,
            habit_id: habit.id,
            value_boolean: habit.type === 'boolean' ? (value.boolean ?? false) : null,
            value_numeric: habit.type === 'numeric' ? (value.numeric ?? null) : null,
          },
          { onConflict: 'checkin_id,habit_id' },
        )
        .select('*')
        .single();
      if (error) throw error;

      updateCache((prev) => ({
        ...prev,
        habit_entries: [
          ...prev.habit_entries.filter((e) => e.habit_id !== habit.id),
          data,
        ],
      }));
      checkinRef.current = {
        ...(checkinRef.current as CheckinWithEntries),
        habit_entries: [
          ...(checkinRef.current?.habit_entries ?? []).filter(
            (e) => e.habit_id !== habit.id,
          ),
          data,
        ],
      };
    },
    [ensureCheckin, updateCache],
  );

  const debounced = useCallback((key: string, fn: () => void) => {
    if (timers.current[key]) window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(fn, DEBOUNCE_MS);
  }, []);

  // ------------------------------------------------------------ API
  const entryFor = useCallback(
    (habitId: string) => checkin?.habit_entries.find((e) => e.habit_id === habitId),
    [checkin],
  );

  const booleanValue = useCallback(
    (habit: HabitRow) => entryFor(habit.id)?.value_boolean ?? false,
    [entryFor],
  );

  const numericValue = useCallback(
    (habit: HabitRow): string => {
      if (numericDrafts[habit.id] !== undefined) return numericDrafts[habit.id];
      const value = entryFor(habit.id)?.value_numeric;
      return value === null || value === undefined ? '' : String(value);
    },
    [numericDrafts, entryFor],
  );

  const isCompleted = useCallback(
    (habit: HabitRow): boolean => {
      if (habit.type === 'boolean') return booleanValue(habit);
      const raw = numericValue(habit);
      const parsed = Number(raw.replace(',', '.'));
      return raw !== '' && !Number.isNaN(parsed) && parsed >= (habit.target_value ?? Infinity);
    },
    [booleanValue, numericValue],
  );

  const toggleHabit = useCallback(
    (habit: HabitRow, next: boolean) => {
      // Optimistisches Update für sofortiges Feedback
      updateCache((prev) => ({
        ...prev,
        habit_entries: prev.habit_entries.some((e) => e.habit_id === habit.id)
          ? prev.habit_entries.map((e) =>
              e.habit_id === habit.id
                ? { ...e, value_boolean: next, completed: next }
                : e,
            )
          : [
              ...prev.habit_entries,
              {
                id: `optimistic-${habit.id}`,
                checkin_id: prev.id,
                habit_id: habit.id,
                value_boolean: next,
                value_numeric: null,
                completed: next,
                updated_at: new Date().toISOString(),
              },
            ],
      }));
      void runSave(() => saveEntry(habit, { boolean: next }));
    },
    [runSave, saveEntry, updateCache],
  );

  const setNumericValue = useCallback(
    (habit: HabitRow, raw: string) => {
      setNumericDrafts((prev) => ({ ...prev, [habit.id]: raw }));
      debounced(`habit-${habit.id}`, () => {
        const normalized = raw.trim().replace(',', '.');
        const parsed = normalized === '' ? null : Number(normalized);
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) return;
        void runSave(() => saveEntry(habit, { numeric: parsed }));
      });
    },
    [debounced, runSave, saveEntry],
  );

  const saveCheckinField = useCallback(
    async (fields: { weight_kg?: number | null; note?: string }) => {
      const row = await ensureCheckin();
      const { error } = await supabase
        .from('daily_checkins')
        .update(fields)
        .eq('id', row.id);
      if (error) throw error;
      updateCache((prev) => ({ ...prev, ...fields }));
    },
    [ensureCheckin, updateCache],
  );

  const setWeight = useCallback(
    (raw: string) => {
      setWeightDraft(raw);
      debounced('weight', () => {
        const normalized = raw.trim().replace(',', '.');
        const parsed = normalized === '' ? null : Number(normalized);
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 20 || parsed > 400)) return;
        void runSave(() => saveCheckinField({ weight_kg: parsed }));
      });
    },
    [debounced, runSave, saveCheckinField],
  );

  const setNote = useCallback(
    (raw: string) => {
      setNoteDraft(raw);
      debounced('note', () => {
        if (raw.length > 500) return;
        void runSave(() => saveCheckinField({ note: raw }));
      });
    },
    [debounced, runSave, saveCheckinField],
  );

  const habits = useMemo(() => challenge?.habits ?? [], [challenge]);
  const completedCount = habits.filter((h) => isCompleted(h)).length;
  const totalCount = habits.length;

  const saveStatus: SaveStatus =
    pending > 0 ? 'saving' : hasError ? 'error' : savedOnce ? 'saved' : 'idle';

  return {
    isLoading,
    saveStatus,
    booleanValue,
    numericValue,
    isCompleted,
    weight: weightDraft ?? (checkin?.weight_kg != null ? String(checkin.weight_kg) : ''),
    note: noteDraft ?? checkin?.note ?? '',
    completedCount,
    totalCount,
    ratio: totalCount === 0 ? 0 : completedCount / totalCount,
    toggleHabit,
    setNumericValue,
    setWeight,
    setNote,
  };
}
