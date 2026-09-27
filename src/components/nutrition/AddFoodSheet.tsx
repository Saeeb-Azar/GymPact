import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FoodEntryRow, FoodRow, MealType } from '@/lib/database.types';
import type { DateString } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { searchOpenFoodFacts, type OffProduct } from '@/lib/openFoodFacts';
import {
  useAddFoodEntries,
  useCreateFood,
  useFoodSearch,
  useRecentFoods,
} from '@/hooks/nutrition';
import { errorMessage } from '@/hooks/queries';
import { Button, Field, Input, Spinner } from '../ui/basics';
import { Segmented, Sheet } from '../ui/motion';
import { useToast } from '../ui/toast';
import { IconFood, IconPlus, IconSearch, IconSparkles } from '../icons';
import { MealIcon } from './MealIcon';
import { AmountPicker, type Per100 } from './AmountPicker';

type View =
  | { kind: 'browse' }
  | { kind: 'amount'; food: Per100; foodId: string | null; off?: OffProduct }
  | { kind: 'quick' }
  | { kind: 'create' };

export function AddFoodSheet({
  open,
  onClose,
  date,
  meal: initialMeal,
}: {
  open: boolean;
  onClose: () => void;
  date: DateString;
  meal: MealType;
}) {
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [view, setView] = useState<View>({ kind: 'browse' });
  const add = useAddFoodEntries();
  const createFood = useCreateFood();
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setMeal(initialMeal);
      setView({ kind: 'browse' });
    }
  }, [open, initialMeal]);

  const addEntry = async (entry: Omit<FoodEntryRow, 'id' | 'created_at' | 'user_id' | 'date' | 'meal'>) => {
    try {
      await add.mutateAsync([{ ...entry, date, meal }]);
      showToast(`${entry.name} hinzugefügt`, 'success');
      onClose();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  const titles: Record<View['kind'], string> = {
    browse: 'Essen hinzufügen',
    amount: 'Menge wählen',
    quick: 'Schnell-Eintrag',
    create: 'Neues Lebensmittel',
  };

  return (
    <Sheet open={open} onClose={onClose} title={titles[view.kind]}>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
        {MEALS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMeal(m.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              meal === m.id
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'bg-surface-100 dark:bg-white/[0.06]'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MealIcon meal={m.id} size={16} /> {m.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view.kind}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
        >
          {view.kind === 'browse' && (
            <Browse
              onPickFood={(food) => setView({ kind: 'amount', food, foodId: food.id })}
              onPickOff={(p) =>
                setView({
                  kind: 'amount',
                  food: { ...p, default_amount_g: p.serving_g ?? 100 },
                  foodId: null,
                  off: p,
                })
              }
              onPickRecent={(e) => {
                if (e.amount_g && e.amount_g > 0) {
                  const f = 100 / Number(e.amount_g);
                  setView({
                    kind: 'amount',
                    foodId: e.food_id,
                    food: {
                      name: e.name,
                      kcal_100: Math.round(Number(e.kcal) * f * 10) / 10,
                      protein_100: Math.round(Number(e.protein_g) * f * 10) / 10,
                      carbs_100: Math.round(Number(e.carbs_g) * f * 10) / 10,
                      fat_100: Math.round(Number(e.fat_g) * f * 10) / 10,
                      default_amount_g: Number(e.amount_g),
                    },
                  });
                } else {
                  void addEntry({
                    food_id: e.food_id,
                    name: e.name,
                    amount_g: null,
                    kcal: e.kcal,
                    protein_g: e.protein_g,
                    carbs_g: e.carbs_g,
                    fat_g: e.fat_g,
                  });
                }
              }}
              onQuick={() => setView({ kind: 'quick' })}
              onCreate={() => setView({ kind: 'create' })}
            />
          )}

          {view.kind === 'amount' && (
            <AmountPicker
              food={view.food}
              loading={add.isPending || createFood.isPending}
              onBack={() => setView({ kind: 'browse' })}
              onSubmit={async (amount, m) => {
                let foodId = view.foodId;
                if (view.off) {
                  // Online-Produkt in die gemeinsame Bibliothek übernehmen
                  try {
                    const food = await createFood.mutateAsync({
                      name: view.off.name,
                      brand: view.off.brand,
                      kcal_100: view.off.kcal_100,
                      protein_100: view.off.protein_100,
                      carbs_100: view.off.carbs_100,
                      fat_100: view.off.fat_100,
                      default_amount_g: view.off.serving_g ?? 100,
                      barcode: view.off.code || null,
                    });
                    foodId = food.id;
                  } catch {
                    foodId = null; // Eintrag trotzdem speichern
                  }
                }
                await addEntry({
                  food_id: foodId,
                  name: view.food.name,
                  amount_g: amount,
                  kcal: m.kcal,
                  protein_g: m.protein,
                  carbs_g: m.carbs,
                  fat_g: m.fat,
                });
              }}
            />
          )}

          {view.kind === 'quick' && (
            <QuickForm
              loading={add.isPending}
              onBack={() => setView({ kind: 'browse' })}
              onSubmit={(v) => addEntry({ ...v, food_id: null, amount_g: null })}
            />
          )}

          {view.kind === 'create' && (
            <CreateFoodForm
              loading={createFood.isPending}
              onBack={() => setView({ kind: 'browse' })}
              onSubmit={async (v) => {
                try {
                  const food = await createFood.mutateAsync(v);
                  showToast('In deiner Bibliothek gespeichert', 'success');
                  setView({ kind: 'amount', food, foodId: food.id });
                } catch (err) {
                  showToast(errorMessage(err), 'error');
                }
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Browse
function Browse({
  onPickFood,
  onPickOff,
  onPickRecent,
  onQuick,
  onCreate,
}: {
  onPickFood: (f: FoodRow) => void;
  onPickOff: (p: OffProduct) => void;
  onPickRecent: (e: FoodEntryRow) => void;
  onQuick: () => void;
  onCreate: () => void;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tab, setTab] = useState<'recent' | 'library' | 'online'>('recent');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 300);
    return () => window.clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (term.trim() && tab === 'recent') setTab('library');
  }, [term, tab]);

  const recent = useRecentFoods();
  const library = useFoodSearch(debounced);
  const online = useQuery({
    queryKey: ['off-search', debounced.toLowerCase()],
    enabled: tab === 'online' && debounced.length >= 2,
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: ({ signal }) => searchOpenFoodFacts(debounced, signal),
  });

  const recentFiltered = (recent.data ?? []).filter((e) =>
    e.name.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 muted" size={20} />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Lebensmittel suchen …"
          className="pl-11"
          type="search"
          enterKeyHint="search"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onQuick}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-surface-300 px-3 py-3 text-left text-sm font-semibold dark:border-white/15"
        >
          <IconSparkles size={20} className="text-brand-500" />
          Schnell-Eintrag
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-surface-300 px-3 py-3 text-left text-sm font-semibold dark:border-white/15"
        >
          <IconPlus size={20} className="text-brand-500" />
          Neu anlegen
        </button>
      </div>

      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'recent', label: 'Zuletzt' },
          { value: 'library', label: 'Bibliothek' },
          { value: 'online', label: 'Online-Suche' },
        ]}
      />

      <div className="space-y-1.5">
        {tab === 'recent' &&
          (recent.isLoading ? (
            <ListSkeleton />
          ) : recentFiltered.length === 0 ? (
            <Hint>Noch nichts gegessen – such etwas oder leg es neu an.</Hint>
          ) : (
            recentFiltered.map((e) => (
              <FoodRowButton
                key={e.id}
                title={e.name}
                subtitle={e.amount_g ? `${Number(e.amount_g)} g` : 'Schnell-Eintrag'}
                kcal={Number(e.kcal)}
                protein={Number(e.protein_g)}
                onClick={() => onPickRecent(e)}
              />
            ))
          ))}

        {tab === 'library' &&
          (library.isLoading ? (
            <ListSkeleton />
          ) : (library.data ?? []).length === 0 ? (
            <Hint>
              Nichts in der Bibliothek gefunden.{' '}
              {debounced && (
                <button type="button" className="font-semibold text-brand-600 dark:text-brand-400" onClick={() => setTab('online')}>
                  Online suchen →
                </button>
              )}
            </Hint>
          ) : (
            library.data!.map((f) => (
              <FoodRowButton
                key={f.id}
                title={f.name}
                subtitle={[f.brand, 'pro 100 g'].filter(Boolean).join(' · ')}
                kcal={Number(f.kcal_100)}
                protein={Number(f.protein_100)}
                onClick={() => onPickFood(f)}
              />
            ))
          ))}

        {tab === 'online' &&
          (debounced.length < 2 ? (
            <Hint>Gib einen Suchbegriff ein – z. B. „Skyr“ oder „Haferflocken“. Daten von Open Food Facts.</Hint>
          ) : online.isLoading ? (
            <ListSkeleton />
          ) : online.isError ? (
            <Hint>Online-Suche gerade nicht erreichbar. Versuch’s gleich nochmal oder leg das Lebensmittel selbst an.</Hint>
          ) : (online.data ?? []).length === 0 ? (
            <Hint>Keine Treffer.</Hint>
          ) : (
            online.data!.map((p, i) => (
              <FoodRowButton
                key={`${p.code}-${i}`}
                title={p.name}
                subtitle={[p.brand, 'pro 100 g'].filter(Boolean).join(' · ')}
                kcal={p.kcal_100}
                protein={p.protein_100}
                image={p.image}
                onClick={() => onPickOff(p)}
              />
            ))
          ))}
      </div>
    </div>
  );
}

function FoodRowButton({
  title,
  subtitle,
  kcal,
  protein,
  image,
  onClick,
}: {
  title: string;
  subtitle: string;
  kcal: number;
  protein: number;
  image?: string | null;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-100 dark:hover:bg-white/[0.05]"
    >
      {image ? (
        <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain" loading="lazy" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-100 muted dark:bg-white/[0.06]">
          <IconFood size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs muted">{subtitle}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold num">{Math.round(kcal)} kcal</span>
        <span className="block text-xs text-protein num">{Math.round(protein * 10) / 10} g P</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400">
        <IconPlus size={18} />
      </span>
    </motion.button>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="px-2 py-6 text-center text-sm muted">{children}</p>;
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-14" />
      ))}
      <div className="flex justify-center pt-2">
        <Spinner className="h-5 w-5 text-brand-500" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Formulare
const toNum = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

function QuickForm({
  loading,
  onBack,
  onSubmit,
}: {
  loading: boolean;
  onBack: () => void;
  onSubmit: (v: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }) => void;
}) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const valid = toNum(kcal) > 0 || toNum(p) > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const kc = toNum(kcal) || Math.round(toNum(p) * 4 + toNum(c) * 4 + toNum(f) * 9);
        onSubmit({
          name: name.trim() || 'Schnell-Eintrag',
          kcal: Math.min(20000, kc),
          protein_g: toNum(p),
          carbs_g: toNum(c),
          fat_g: toNum(f),
        });
      }}
    >
      <Field label="Bezeichnung (optional)">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Döner, Restaurant …" maxLength={120} />
      </Field>
      <Field label="Kalorien" hint="Leer lassen = aus Makros berechnen">
        <Input value={kcal} onChange={(e) => setKcal(e.target.value)} inputMode="decimal" placeholder="kcal" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Protein (g)">
          <Input value={p} onChange={(e) => setP(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Kohlenh. (g)">
          <Input value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Fett (g)">
          <Input value={f} onChange={(e) => setF(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          Zurück
        </Button>
        <Button type="submit" disabled={!valid} loading={loading} className="flex-[2]">
          Eintragen
        </Button>
      </div>
    </form>
  );
}

function CreateFoodForm({
  loading,
  onBack,
  onSubmit,
}: {
  loading: boolean;
  onBack: () => void;
  onSubmit: (v: {
    name: string;
    brand: string;
    kcal_100: number;
    protein_100: number;
    carbs_100: number;
    fat_100: number;
    default_amount_g: number;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [portion, setPortion] = useState('100');
  const macroSum = toNum(p) + toNum(c) + toNum(f);
  const valid = name.trim().length > 0 && toNum(kcal) > 0 && toNum(kcal) <= 1000 && macroSum <= 100;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          name: name.trim(),
          brand: brand.trim(),
          kcal_100: toNum(kcal),
          protein_100: toNum(p),
          carbs_100: toNum(c),
          fat_100: toNum(f),
          default_amount_g: toNum(portion) || 100,
        });
      }}
    >
      <p className="text-sm muted">
        Wird in der gemeinsamen Bibliothek gespeichert – so kann es jeder in der App wiederverwenden.
      </p>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Magerquark" maxLength={120} autoFocus />
      </Field>
      <Field label="Marke (optional)">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
      </Field>
      <p className="pt-1 text-xs font-semibold uppercase tracking-wider muted">Nährwerte pro 100 g</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kalorien">
          <Input value={kcal} onChange={(e) => setKcal(e.target.value)} inputMode="decimal" placeholder="kcal" />
        </Field>
        <Field label="Protein (g)">
          <Input value={p} onChange={(e) => setP(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Kohlenhydrate (g)">
          <Input value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Fett (g)">
          <Input value={f} onChange={(e) => setF(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
      </div>
      {macroSum > 100 && <p className="text-sm text-red-500">Makros zusammen dürfen 100 g nicht übersteigen.</p>}
      <Field label="Übliche Portion (g)">
        <Input value={portion} onChange={(e) => setPortion(e.target.value)} inputMode="decimal" />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          Zurück
        </Button>
        <Button type="submit" disabled={!valid} loading={loading} className="flex-[2]">
          Speichern
        </Button>
      </div>
    </form>
  );
}
