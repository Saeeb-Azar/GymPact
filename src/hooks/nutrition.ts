// Daten-Hooks für den Ernährungsbereich.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type {
  DailyLogRow,
  FoodEntryRow,
  FoodRow,
  MealType,
  NutritionGoalsRow,
} from '@/lib/database.types';
import type { DateString } from '@/lib/dates';
import { DEFAULT_GOALS } from '@/lib/nutrition';

export type Goals = Omit<NutritionGoalsRow, 'user_id' | 'updated_at'> & { isDefault: boolean };

export type NewFoodEntry = Omit<FoodEntryRow, 'id' | 'created_at' | 'user_id'>;

const keys = {
  goals: (u: string) => ['nutrition-goals', u] as const,
  day: (u: string, d: string) => ['food-entries', u, d] as const,
  range: (u: string, from: string, to: string) => ['food-entries', u, 'range', from, to] as const,
  log: (u: string, d: string) => ['daily-log', u, d] as const,
  logs: (u: string, from: string, to: string) => ['daily-log', u, 'range', from, to] as const,
  recent: (u: string) => ['food-entries', u, 'recent'] as const,
};

// ---------------------------------------------------------------- Ziele
export function useNutritionGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.goals(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<Goals> => {
      const { data, error } = await supabase
        .from('nutrition_goals')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...DEFAULT_GOALS, isDefault: true };
      const { user_id: _u, updated_at: _t, ...goals } = data;
      return { ...goals, isDefault: false };
    },
  });
}

export function useSaveNutritionGoals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goals: Omit<Goals, 'isDefault'>) => {
      const { error } = await supabase
        .from('nutrition_goals')
        .upsert({ user_id: user!.id, ...goals }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals(user!.id) }),
  });
}

// ---------------------------------------------------------------- Einträge
export function useFoodEntries(date: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.day(user?.id ?? 'anon', date),
    enabled: !!user,
    queryFn: async (): Promise<FoodEntryRow[]> => {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', date)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFoodEntriesRange(from: DateString, to: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.range(user?.id ?? 'anon', from, to),
    enabled: !!user,
    queryFn: async (): Promise<FoodEntryRow[]> => {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Zuletzt gegessene Lebensmittel (eindeutig nach Name) für Schnell-Hinzufügen. */
export function useRecentFoods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.recent(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<FoodEntryRow[]> => {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      const seen = new Set<string>();
      const result: FoodEntryRow[] = [];
      for (const e of data ?? []) {
        const k = e.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(e);
        if (result.length >= 25) break;
      }
      return result;
    },
  });
}

export function useAddFoodEntries() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: NewFoodEntry[]) => {
      if (entries.length === 0) return;
      const { error } = await supabase
        .from('food_entries')
        .insert(entries.map((e) => ({ ...e, user_id: user!.id })));
      if (error) throw error;
    },
    onMutate: async (entries) => {
      // Optimistisch in die Tagesliste einfügen → sofortiges Feedback
      const byDate = new Map<string, NewFoodEntry[]>();
      entries.forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]));
      for (const [date, list] of byDate) {
        const key = keys.day(user!.id, date);
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<FoodEntryRow[]>(key, (old = []) => [
          ...old,
          ...list.map((e, i) => ({
            ...e,
            id: `temp-${Date.now()}-${i}`,
            user_id: user!.id,
            created_at: new Date().toISOString(),
          })),
        ]);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['food-entries', user!.id] }),
  });
}

export function useUpdateFoodEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...update }: Partial<FoodEntryRow> & { id: string }) => {
      const { error } = await supabase.from('food_entries').update(update).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['food-entries', user!.id] }),
  });
}

export function useDeleteFoodEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Pick<FoodEntryRow, 'id' | 'date'>) => {
      const { error } = await supabase.from('food_entries').delete().eq('id', entry.id);
      if (error) throw error;
    },
    onMutate: async (entry) => {
      const key = keys.day(user!.id, entry.date);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<FoodEntryRow[]>(key, (old = []) => old.filter((e) => e.id !== entry.id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['food-entries', user!.id] }),
  });
}

/** Alle Einträge einer Mahlzeit (oder eines ganzen Tages) auf ein anderes Datum kopieren. */
export function useCopyEntries() {
  const add = useAddFoodEntries();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { fromDate: DateString; toDate: DateString; meal?: MealType }) => {
      let q = supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', args.fromDate);
      if (args.meal) q = q.eq('meal', args.meal);
      const { data, error } = await q.order('created_at');
      if (error) throw error;
      const list = (data ?? []).map(
        ({ id: _id, created_at: _c, user_id: _u, ...rest }): NewFoodEntry => ({
          ...rest,
          date: args.toDate,
        }),
      );
      await add.mutateAsync(list);
      return list.length;
    },
  });
}

// ---------------------------------------------------------------- Lebensmittel
export function useFoodSearch(term: string) {
  const { user } = useAuth();
  const t = term.trim();
  return useQuery({
    queryKey: ['foods', t.toLowerCase()],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<FoodRow[]> => {
      let q = supabase.from('foods').select('*');
      if (t) {
        const escaped = t.replace(/[%_\\]/g, (c) => `\\${c}`);
        q = q.or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%`);
      }
      const { data, error } = await q.order('name').limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateFood() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      food: Omit<FoodRow, 'id' | 'created_at' | 'created_by' | 'barcode'> & { barcode?: string | null },
    ): Promise<FoodRow> => {
      // Duplikate per Barcode vermeiden (z. B. aus Open Food Facts übernommen)
      if (food.barcode) {
        const { data: existing } = await supabase
          .from('foods')
          .select('*')
          .eq('barcode', food.barcode)
          .limit(1)
          .maybeSingle();
        if (existing) return existing;
      }
      const { data, error } = await supabase
        .from('foods')
        .insert({ ...food, created_by: user!.id })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('foods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  });
}

// ---------------------------------------------------------------- Tageswerte
export function useDailyLog(date: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.log(user?.id ?? 'anon', date),
    enabled: !!user,
    queryFn: async (): Promise<DailyLogRow | null> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useDailyLogsRange(from: DateString, to: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.logs(user?.id ?? 'anon', from, to),
    enabled: !!user,
    queryFn: async (): Promise<DailyLogRow[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', from)
        .lte('date', to)
        .order('date');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Letztes eingetragenes Körpergewicht (für Bedarfsrechner & Dashboard). */
export function useLatestWeight() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['daily-log', user?.id ?? 'anon', 'latest-weight'],
    enabled: !!user,
    queryFn: async (): Promise<{ date: string; kg: number } | null> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, body_weight_kg')
        .eq('user_id', user!.id)
        .not('body_weight_kg', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data && data.body_weight_kg != null
        ? { date: data.date, kg: Number(data.body_weight_kg) }
        : null;
    },
  });
}

export function useUpsertDailyLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: { date: DateString } & Partial<Pick<DailyLogRow, 'water_ml' | 'body_weight_kg' | 'note'>>,
    ) => {
      const { error } = await supabase
        .from('daily_logs')
        .upsert({ user_id: user!.id, ...args }, { onConflict: 'user_id,date' });
      if (error) throw error;
    },
    onMutate: async (args) => {
      const key = keys.log(user!.id, args.date);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<DailyLogRow | null>(key, (old) => ({
        user_id: user!.id,
        water_ml: 0,
        body_weight_kg: null,
        note: '',
        updated_at: new Date().toISOString(),
        ...(old ?? {}),
        ...args,
      }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['daily-log', user!.id] }),
  });
}
