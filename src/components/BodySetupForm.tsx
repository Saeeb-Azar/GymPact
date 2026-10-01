// „Deine Werte“: Gewicht, Größe, Alter, Geschlecht, Aktivität und Ziel
// erfassen → persönliche Kalorien-/Makroziele berechnen und speichern.
// Wird als letzter Onboarding-Schritt gezeigt und steckt hinter dem
// Bedarfsrechner in den Einstellungen. Speichert:
//   - Größe/Geburtsjahr/Geschlecht → profiles (einmalige Stammdaten)
//   - heutiges Gewicht            → daily_logs (täglich trackbar)
//   - berechnete Ziele            → nutrition_goals

import { useState } from 'react';
import { useProfile, useUpdateProfile } from '@/hooks/queries';
import {
  useLatestWeight,
  useSaveNutritionGoals,
  useUpsertDailyLog,
} from '@/hooks/nutrition';
import {
  ACTIVITY_LEVELS,
  suggestGoals,
  type GoalType,
  type Sex,
} from '@/lib/nutrition';
import { useToday } from '@/hooks/useToday';
import { Button, Field, Input, Select } from './ui/basics';
import { Segmented } from './ui/motion';
import { useToast } from './ui/toast';

export function BodySetupForm({
  submitLabel = 'Speichern',
  onDone,
}: {
  submitLabel?: string;
  onDone: () => void;
}) {
  const today = useToday();
  const { data: profile } = useProfile();
  const { data: latest } = useLatestWeight();
  const updateProfile = useUpdateProfile();
  const saveGoals = useSaveNutritionGoals();
  const upsertLog = useUpsertDailyLog();
  const { showToast } = useToast();

  const currentYear = new Date().getFullYear();
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [age, setAge] = useState(
    profile?.birth_year ? String(currentYear - profile.birth_year) : '',
  );
  const [height, setHeight] = useState(
    profile?.height_cm ? String(profile.height_cm) : '',
  );
  const [weight, setWeight] = useState(latest ? String(latest.kg) : '');
  const [activity, setActivity] = useState<number>(1.55);
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [saving, setSaving] = useState(false);

  const n = (s: string) => Number(s.replace(',', '.')) || 0;
  const ok =
    n(age) >= 14 &&
    n(age) <= 100 &&
    n(height) >= 120 &&
    n(height) <= 230 &&
    n(weight) >= 35 &&
    n(weight) <= 300;
  const result = ok
    ? suggestGoals({ sex, age: n(age), heightCm: n(height), weightKg: n(weight), activity, goal })
    : null;

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await Promise.all([
        updateProfile.mutateAsync({
          sex,
          height_cm: Math.round(n(height)),
          birth_year: currentYear - Math.round(n(age)),
        }),
        saveGoals.mutateAsync(result),
        upsertLog.mutateAsync({ date: today, body_weight_kg: n(weight) }),
      ]);
      showToast('Deine Ziele sind eingerichtet 🎯', 'success');
      onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: 'Männlich' },
          { value: 'female', label: 'Weiblich' },
        ]}
      />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Alter">
          <Input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="numeric"
            placeholder="25"
          />
        </Field>
        <Field label="Größe (cm)">
          <Input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            inputMode="numeric"
            placeholder="180"
          />
        </Field>
        <Field label="Gewicht (kg)">
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="80"
          />
        </Field>
      </div>
      <Field label="Aktivität">
        <Select value={activity} onChange={(e) => setActivity(Number(e.target.value))}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.factor} value={a.factor}>
              {a.label} – {a.hint}
            </option>
          ))}
        </Select>
      </Field>
      <Segmented
        value={goal}
        onChange={setGoal}
        options={[
          { value: 'cut', label: 'Abnehmen' },
          { value: 'maintain', label: 'Halten' },
          { value: 'bulk', label: 'Aufbauen' },
        ]}
      />

      {result && (
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-100 p-3 text-center dark:bg-white/[0.04]">
          <div>
            <p className="font-display text-lg font-bold num">{result.calories}</p>
            <p className="text-[10px] muted">kcal</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-protein num">{result.protein_g}</p>
            <p className="text-[10px] muted">Protein</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-carbs num">{result.carbs_g}</p>
            <p className="text-[10px] muted">Kohlenh.</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-fat num">{result.fat_g}</p>
            <p className="text-[10px] muted">Fett</p>
          </div>
        </div>
      )}
      <p className="text-xs muted">
        Schätzung nach Mifflin-St Jeor. Protein 2–2,2 g/kg, Fett 0,9 g/kg, Rest
        Kohlenhydrate. Alles später unter Profil → Ernährungsziele änderbar.
      </p>

      <Button className="w-full" disabled={!result} loading={saving} onClick={() => void save()}>
        {submitLabel}
      </Button>
    </div>
  );
}
