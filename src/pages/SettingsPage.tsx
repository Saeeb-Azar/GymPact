// „Einstellungen“: Profil (Name, Avatar, Zeitzone), Darstellung,
// Benachrichtigungen inkl. Web-Push und Ruhezeiten, Abmelden.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { useActiveGroup } from '@/hooks/useActiveGroup';
import {
  useActiveChallenge,
  useIsAdmin,
  useMyHabitTargets,
  useNotificationPreferences,
  useProfile,
  useSendTestPush,
  useSetHabitTarget,
  useUpdateNotificationPreferences,
  useUpdateProfile,
} from '@/hooks/queries';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';
import {
  disablePush,
  enablePush,
  hasActivePushSubscription,
  iosNeedsInstallForPush,
  pushSupported,
} from '@/lib/push';
import { profileSchema, type ProfileValues } from '@/lib/validation';
import { availableTimezones, toTimeInputValue } from '@/lib/dates';
import {
  Button,
  Card,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
  Toggle,
} from '@/components/ui/basics';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/toast';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { IconLogout, IconSettings } from '@/components/icons';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const isAdmin = useIsAdmin();
  const [showGuide, setShowGuide] = useState(false);

  if (isLoading || !profile || !user) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle>Einstellungen</PageTitle>
      <ProfileSection
        userId={user.id}
        email={user.email ?? ''}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
        timezone={profile.timezone}
      />
      <MyGoalsSection />
      <AppearanceSection />
      <NotificationSection userId={user.id} />
      {isAdmin && (
        <Link to="/admin">
          <Card className="flex items-center gap-3">
            <IconSettings size={20} className="text-brand-700 dark:text-brand-300" />
            <span className="font-medium">Admin-Bereich</span>
          </Card>
        </Link>
      )}
      {showGuide && <OnboardingGuide onClose={() => setShowGuide(false)} />}
      <Card className="space-y-3">
        <Button variant="secondary" className="w-full" onClick={() => setShowGuide(true)}>
          Anleitung ansehen (Erste Schritte)
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await supabase.auth.resetPasswordForEmail(user.email ?? '', {
              redirectTo: `${window.location.origin}/reset-password`,
            });
          }}
        >
          Passwort per E-Mail zurücksetzen
        </Button>
        <Button variant="danger" className="w-full" onClick={() => void signOut()}>
          <IconLogout size={18} /> Abmelden
        </Button>
      </Card>
      <p className="pb-2 text-center text-xs text-surface-900/40 dark:text-surface-100/40">
        GymPact · privat & werbefrei
      </p>
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
      showToast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error');
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
      showToast(err instanceof Error ? err.message : 'Upload fehlgeschlagen', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">Profil</h2>
      <div className="mt-3 flex items-center gap-4">
        <Avatar name={displayName} avatarUrl={avatarUrl} size={64} />
        <div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="text-sm font-medium text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-300"
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
          hint="Bestimmt, wann dein Tag endet und wann Erinnerungen kommen."
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

// ---------------------------------------------------------------- Meine Ziele
// Persönliche Zielwerte für numerische Gewohnheiten der aktiven Challenge –
// das Thema ist für die Gruppe gleich, der Zielwert aber individuell.
function MyGoalsSection() {
  const { activeGroupId } = useActiveGroup();
  const { data: challenge } = useActiveChallenge(activeGroupId);
  const { data: targets = [] } = useMyHabitTargets();
  const setTarget = useSetHabitTarget();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  const numericHabits = (challenge?.habits ?? []).filter((h) => h.type === 'numeric');
  if (!challenge || numericHabits.length === 0) return null;

  const valueFor = (habitId: string): string => {
    if (drafts[habitId] !== undefined) return drafts[habitId];
    const target = targets.find((t) => t.habit_id === habitId);
    return target ? String(target.target_value) : '';
  };

  const onChange = (habitId: string, raw: string) => {
    setDrafts((prev) => ({ ...prev, [habitId]: raw }));
    if (timers.current[habitId]) window.clearTimeout(timers.current[habitId]);
    timers.current[habitId] = window.setTimeout(() => {
      const parsed = Number(raw.trim().replace(',', '.'));
      if (raw.trim() === '' || Number.isNaN(parsed) || parsed <= 0) return;
      setTarget.mutate({ habitId, targetValue: parsed });
    }, 700);
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">Meine Ziele</h2>
      <p className="mt-1 text-sm text-surface-900/60 dark:text-surface-100/60">
        Deine persönlichen Zielwerte für „{challenge.name}“ – unabhängig von den
        Zielen deiner Gruppenmitglieder.
      </p>
      <div className="mt-3 space-y-3">
        {numericHabits.map((habit) => (
          <Field key={habit.id} label={habit.name} htmlFor={`goal-${habit.id}`}>
            <div className="flex items-center gap-2">
              <Input
                id={`goal-${habit.id}`}
                type="text"
                inputMode="decimal"
                value={valueFor(habit.id)}
                onChange={(e) => onChange(habit.id, e.target.value)}
                className="text-right tabular-nums"
              />
              <span className="w-8 shrink-0 text-sm text-surface-900/50 dark:text-surface-100/50">
                {habit.unit ?? ''}
              </span>
            </div>
          </Field>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Darstellung
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Hell' },
    { value: 'dark', label: 'Dunkel' },
  ];
  return (
    <Card>
      <h2 className="text-base font-semibold">Darstellung</h2>
      <div
        role="radiogroup"
        aria-label="Farbschema"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => setTheme(option.value)}
            className={`touch-target rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              theme === option.value
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                : 'border-surface-200 text-surface-900/70 dark:border-surface-800 dark:text-surface-100/70'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Benachrichtigungen
function NotificationSection({ userId }: { userId: string }) {
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const testPush = useSendTestPush();
  const { showToast } = useToast();
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    void hasActivePushSubscription().then(setPushActive);
  }, []);

  // Test-Push mit konkreter Diagnose statt Rätselraten
  const runPushTest = async () => {
    setTestResult(null);
    try {
      const result = await testPush.mutateAsync();
      if (result.quiet) {
        setTestResult(
          'Ruhezeit aktiv – gerade werden keine Benachrichtigungen zugestellt. Passe unten die Ruhezeiten an und teste erneut.',
        );
      } else if (result.pushEnabled === false) {
        setTestResult('Der „Web-Push“-Schalter oben ist aus – erst einschalten.');
      } else if (result.subscriptions === -1) {
        setTestResult(
          'Auf dem Server fehlen die VAPID-Secrets (Supabase → Edge Functions → Secrets).',
        );
      } else if (result.subscriptions === 0) {
        setTestResult(
          'Kein Gerät registriert. Tippe oben bei „Dieses Gerät“ auf „Aktivieren“ (iPhone: App muss vom Home-Bildschirm geöffnet sein).',
        );
      } else if ((result.pushed ?? 0) > 0) {
        setTestResult(null);
        showToast(`Test-Push an ${result.pushed} Gerät(e) gesendet 🎉`, 'success');
      } else {
        const firstError = result.pushErrors?.[0];
        if (firstError?.status === 403 || firstError?.status === 401) {
          setTestResult(
            'Die VAPID-Schlüssel passen nicht zusammen: Der Public Key im Frontend (Hostinger) gehört nicht zum Private Key in Supabase. Beide neu setzen, Push am Gerät deaktivieren und wieder aktivieren.',
          );
        } else {
          setTestResult(
            `Zustellung fehlgeschlagen${firstError ? `: ${firstError.status ?? ''} ${firstError.message}` : ' (Details in den send-push-Logs)'}`,
          );
        }
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test fehlgeschlagen');
    }
  };

  if (!prefs) return null;

  const save = (update: Parameters<typeof updatePrefs.mutateAsync>[0]) => {
    updatePrefs.mutateAsync(update).catch(() => {
      showToast('Einstellung konnte nicht gespeichert werden', 'error');
    });
  };

  const togglePushDevice = async () => {
    setPushBusy(true);
    try {
      if (pushActive) {
        await disablePush();
        setPushActive(false);
        showToast('Push auf diesem Gerät deaktiviert', 'info');
      } else {
        const result = await enablePush(userId);
        if (result.ok) {
          setPushActive(true);
          showToast('Push aktiviert', 'success');
        } else {
          showToast(result.message, 'error');
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">Benachrichtigungen</h2>

      <div className="mt-2 divide-y divide-surface-100 dark:divide-surface-800">
        <Toggle
          label="In-App"
          description="Benachrichtigungen in der App anzeigen"
          checked={prefs.in_app}
          onChange={(v) => save({ in_app: v })}
        />
        <Toggle
          label="Web-Push"
          description="Mitteilungen auf deinen Geräten erhalten"
          checked={prefs.push}
          onChange={(v) => save({ push: v })}
        />
        <Toggle
          label="E-Mail (Fallback)"
          description="E-Mail, wenn kein Gerät erreichbar ist"
          checked={prefs.email}
          onChange={(v) => save({ email: v })}
        />
      </div>

      {/* Gerätebezogenes Push-Abo */}
      <div className="mt-3 rounded-2xl bg-surface-100 p-3 dark:bg-surface-800">
        {iosNeedsInstallForPush() ? (
          <div className="text-sm">
            <p className="font-medium">Push auf dem iPhone/iPad aktivieren</p>
            <p className="mt-1 text-surface-900/60 dark:text-surface-100/60">
              Füge GymPact zuerst zum Home-Bildschirm hinzu: Tippe in Safari auf{' '}
              <strong>Teilen</strong> → <strong>„Zum Home-Bildschirm“</strong>. Öffne die
              App dann von dort und aktiviere Push hier erneut.
            </p>
          </div>
        ) : pushSupported() ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">Dieses Gerät</p>
              <p className="text-surface-900/60 dark:text-surface-100/60">
                {pushActive ? 'Push ist aktiv' : 'Push ist nicht aktiviert'}
              </p>
            </div>
            <Button
              variant={pushActive ? 'secondary' : 'primary'}
              loading={pushBusy}
              onClick={() => void togglePushDevice()}
              className="px-4 py-2 text-sm"
            >
              {pushActive ? 'Deaktivieren' : 'Aktivieren'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-surface-900/60 dark:text-surface-100/60">
            Dieser Browser unterstützt kein Web-Push.
          </p>
        )}

        {/* Test-Push mit Diagnose */}
        {pushSupported() && !iosNeedsInstallForPush() && (
          <div className="mt-3 border-t border-surface-200 pt-3 dark:border-surface-800">
            <Button
              variant="secondary"
              className="w-full py-2 text-sm"
              loading={testPush.isPending}
              onClick={() => void runPushTest()}
            >
              Test-Push an dieses Konto senden
            </Button>
            {testResult && (
              <p
                role="alert"
                className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
              >
                {testResult}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Ruhezeiten */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Ruhezeiten</h3>
        <p className="text-xs text-surface-900/50 dark:text-surface-100/50">
          In dieser Zeit bekommst du keine Erinnerungen.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Von" htmlFor="quiet-start">
            <Input
              id="quiet-start"
              type="time"
              value={toTimeInputValue(prefs.quiet_hours_start)}
              onChange={(e) => save({ quiet_hours_start: e.target.value })}
            />
          </Field>
          <Field label="Bis" htmlFor="quiet-end">
            <Input
              id="quiet-end"
              type="time"
              value={toTimeInputValue(prefs.quiet_hours_end)}
              onChange={(e) => save({ quiet_hours_end: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {/* Automatische Erinnerungen */}
      <div className="mt-4">
        <Toggle
          label="Automatische Erinnerung"
          description="Abendlicher Hinweis auf offene Gewohnheiten"
          checked={prefs.auto_reminders}
          onChange={(v) => save({ auto_reminders: v })}
        />
        {prefs.auto_reminders && (
          <div className="mt-2">
            <Field label="Uhrzeit" htmlFor="auto-time">
              <Input
                id="auto-time"
                type="time"
                value={toTimeInputValue(prefs.auto_reminder_time)}
                onChange={(e) => save({ auto_reminder_time: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>
    </Card>
  );
}
