// Profil, Ernährungsziele (mit Bedarfsrechner), Darstellung, Konto.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { errorMessage, useIsAdmin, useProfile, useUpdateProfile } from '@/hooks/queries';
import { useLatestWeight, useNutritionGoals, useSaveNutritionGoals } from '@/hooks/nutrition';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';
import { profileSchema, type ProfileValues } from '@/lib/validation';
import { availableTimezones } from '@/lib/dates';
import {
  ACTIVITY_LEVELS,
  macroEnergySplit,
  suggestGoals,
  type GoalType,
  type Sex,
} from '@/lib/nutrition';
import { Button, Card, Field, Input, PageTitle, Select, Spinner } from '@/components/ui/basics';
import { Segmented, Sheet } from '@/components/ui/motion';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/toast';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { IconChevronRight, IconLogout, IconShield, IconSparkles } from '@/components/icons';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const isAdmin = useIsAdmin();
  const [showGuide, setShowGuide] = useState(false);
  const { showToast } = useToast();

  if (isLoading || !profile || !user) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle eyebrow="Profil">Einstellungen</PageTitle>
      <ProfileSection
        userId={user.id}
        email={user.email ?? ''}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
        timezone={profile.timezone}
      />
      <GoalsSection />
      <AppearanceSection />
      {isAdmin && (
        <Link to="/admin" className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 text-white">
            <IconShield size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Admin-Bereich</span>
            <span className="block text-xs muted">Nutzer & Aktivität verwalten</span>
          </span>
          <IconChevronRight className="muted" />
        </Link>
      )}
      {showGuide && <OnboardingGuide onClose={() => setShowGuide(false)} />}
      <Card className="space-y-3">
        <Button variant="secondary" className="w-full" onClick={() => setShowGuide(true)}>
          Einführung ansehen
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email ?? '', {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            showToast(error ? errorMessage(error) : 'E-Mail zum Zurücksetzen ist unterwegs', error ? 'error' : 'success');
          }}
        >
          Passwort per E-Mail zurücksetzen
        </Button>
        <Button variant="danger" className="w-full" onClick={() => void signOut()}>
          <IconLogout size={18} /> Abmelden
        </Button>
      </Card>
      <p className="pb-2 text-center text-xs muted">GymPact · privat & werbefrei</p>
    </div>
  );
}

// ---------------------------------------------------------------- Profil
function ProfileSection({
  userId,
  email,
  displayName,
  avatarUrl,
  timezone,
}: {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
}) {
  const updateProfile = useUpdateProfile();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName, timezone },
  });

  const onSubmit = async (values: ProfileValues) => {
    try {
      await updateProfile.mutateAsync({
        display_name: values.displayName,
        timezone: values.timezone,
      });
      reset(values);
      showToast('Profil gespeichert', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  const uploadAvatar = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      showToast('Bitte ein Bild unter 3 MB wählen', 'error');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await updateProfile.mutateAsync({ avatar_url: data.publicUrl });
      showToast('Avatar aktualisiert', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Profil</h2>
      <div className="mt-3 flex items-center gap-4">
        <Avatar name={displayName} avatarUrl={avatarUrl} size={64} />
        <div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
          >
            {uploading ? 'Lädt hoch…' : 'Avatar ändern'}
          </button>
          <p className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
            {email}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadAvatar(file);
            e.target.value = '';
          }}
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3" noValidate>
        <Field
          label="Anzeigename"
          htmlFor="displayName"
          error={errors.displayName?.message}
        >
          <Input id="displayName" {...register('displayName')} />
        </Field>
        <Field
          label="Zeitzone"
          htmlFor="timezone"
          error={errors.timezone?.message}
          hint="Bestimmt, wann dein Tag endet."
        >
          <Select id="timezone" {...register('timezone')}>
            {availableTimezones().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        {isDirty && (
          <Button type="submit" loading={updateProfile.isPending} className="w-full">
            Profil speichern
          </Button>
        )}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- Ziele
function GoalsSection() {
  const { data: goals } = useNutritionGoals();
  const save = useSaveNutritionGoals();
  const { showToast } = useToast();
  const [values, setValues] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '', water_ml: '' });
  const [calcOpen, setCalcOpen] = useState(false);

  useEffect(() => {
    if (goals)
      setValues({
        calories: String(goals.calories),
        protein_g: String(goals.protein_g),
        carbs_g: String(goals.carbs_g),
        fat_g: String(goals.fat_g),
        water_ml: String(goals.water_ml),
      });
  }, [goals]);

  const num = (s: string) => Math.round(Number(s.replace(',', '.')) || 0);
  const parsed = {
    calories: num(values.calories),
    protein_g: num(values.protein_g),
    carbs_g: num(values.carbs_g),
    fat_g: num(values.fat_g),
    water_ml: num(values.water_ml),
  };
  const macroKcal = parsed.protein_g * 4 + parsed.carbs_g * 4 + parsed.fat_g * 9;
  const valid = parsed.calories >= 500 && parsed.calories <= 10000;
  const dirty =
    !!goals &&
    (goals.isDefault ||
      (Object.keys(parsed) as (keyof typeof parsed)[]).some((k) => parsed[k] !== goals[k]));
  const split = macroEnergySplit({ kcal: macroKcal, protein: parsed.protein_g, carbs: parsed.carbs_g, fat: parsed.fat_g });

  const field = (key: keyof typeof values, label: string, unit: string) => (
    <Field label={label}>
      <div className="relative">
        <Input
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          inputMode="numeric"
          className="pr-12"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm muted">{unit}</span>
      </div>
    </Field>
  );

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Ernährungsziele</h2>
        <button
          type="button"
          onClick={() => setCalcOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-brand-400"
        >
          <IconSparkles size={14} /> Bedarf berechnen
        </button>
      </div>
      {goals?.isDefault && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Noch Standardwerte – passe sie an oder lass sie berechnen.
        </p>
      )}
      <div className="mt-4 space-y-3">
        {field('calories', 'Kalorien', 'kcal')}
        <div className="grid grid-cols-3 gap-2">
          {field('protein_g', 'Protein', 'g')}
          {field('carbs_g', 'Kohlenh.', 'g')}
          {field('fat_g', 'Fett', 'g')}
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07]">
          <span style={{ width: `${split.protein * 100}%`, background: '#8b5cf6' }} />
          <span className="border-l-2 border-white dark:border-surface-850" style={{ width: `${split.carbs * 100}%`, background: '#d97706' }} />
          <span className="border-l-2 border-white dark:border-surface-850" style={{ width: `${split.fat * 100}%`, background: '#ec4899' }} />
        </div>
        <p className={`text-xs ${Math.abs(macroKcal - parsed.calories) > parsed.calories * 0.1 ? 'text-amber-600 dark:text-amber-400' : 'muted'}`}>
          Makros ergeben {macroKcal.toLocaleString('de-DE')} kcal · P {Math.round(split.protein * 100)} % · K{' '}
          {Math.round(split.carbs * 100)} % · F {Math.round(split.fat * 100)} %
        </p>
        {field('water_ml', 'Wasser', 'ml')}
        {dirty && (
          <Button
            className="w-full"
            disabled={!valid}
            loading={save.isPending}
            onClick={() =>
              save.mutate(parsed, {
                onSuccess: () => showToast('Ziele gespeichert', 'success'),
                onError: (err) => showToast(errorMessage(err), 'error'),
              })
            }
          >
            Ziele speichern
          </Button>
        )}
      </div>
      <CalculatorSheet
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        onApply={(g) => {
          setValues({
            calories: String(g.calories),
            protein_g: String(g.protein_g),
            carbs_g: String(g.carbs_g),
            fat_g: String(g.fat_g),
            water_ml: String(g.water_ml),
          });
          setCalcOpen(false);
          showToast('Werte übernommen – jetzt speichern', 'info');
        }}
      />
    </Card>
  );
}

function CalculatorSheet({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (g: ReturnType<typeof suggestGoals>) => void;
}) {
  const { data: latest } = useLatestWeight();
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('25');
  const [height, setHeight] = useState('180');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<number>(1.55);
  const [goal, setGoal] = useState<GoalType>('maintain');

  useEffect(() => {
    if (open && !weight && latest) setWeight(String(latest.kg));
  }, [open, latest, weight]);

  const n = (s: string) => Number(s.replace(',', '.')) || 0;
  const ok = n(age) >= 14 && n(age) <= 100 && n(height) >= 120 && n(height) <= 230 && n(weight) >= 35 && n(weight) <= 300;
  const result = ok
    ? suggestGoals({ sex, age: n(age), heightCm: n(height), weightKg: n(weight), activity, goal })
    : null;

  return (
    <Sheet open={open} onClose={onClose} title="Bedarfsrechner">
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
            <Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Größe (cm)">
            <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Gewicht (kg)">
            <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
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
          Schätzung nach Mifflin-St Jeor. Protein 2–2,2 g/kg, Fett 0,9 g/kg, Rest Kohlenhydrate.
        </p>
        <Button className="w-full" disabled={!result} onClick={() => result && onApply(result)}>
          Übernehmen
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Darstellung
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <h2 className="mb-3 font-display text-lg font-bold">Darstellung</h2>
      <Segmented<ThemePreference>
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'dark', label: '🌙 Dunkel' },
          { value: 'light', label: '☀️ Hell' },
          { value: 'system', label: 'System' },
        ]}
      />
    </Card>
  );
}
