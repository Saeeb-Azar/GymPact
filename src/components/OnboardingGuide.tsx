// Einleitung für neue Nutzer: erscheint automatisch nach der ersten
// Anmeldung (pro Gerät, localStorage) und erklärt Schritt für Schritt,
// was zu tun ist. Über die Einstellungen jederzeit wieder aufrufbar.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { isIos } from '@/lib/push';
import { Button } from './ui/basics';
import {
  IconBell,
  IconCheck,
  IconGroup,
  IconProgress,
  IconShare,
  IconToday,
} from './icons';

const STORAGE_PREFIX = 'gympact-onboarding-done-';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function hasSeenOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function resetOnboarding(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignorieren */
  }
}

interface Step {
  icon: typeof IconGroup;
  title: string;
  text: string;
}

function buildSteps(ios: boolean): Step[] {
  return [
    {
      icon: IconGroup,
      title: '1 · Gruppe beitreten oder erstellen',
      text: 'Hast du einen Einladungslink oder Code bekommen? Dann tippe unter „Gruppe“ auf „Mit Code beitreten“. Ohne Einladung erstellst du dort eine eigene Gruppe und teilst den Code mit deinen Trainingspartnern.',
    },
    {
      icon: IconCheck,
      title: '2 · Deine persönlichen Ziele eintragen',
      text: 'Die Themen (z. B. Protein, Wasser, Schritte) gelten für die ganze Gruppe – aber DEINE Zielwerte gehören dir. Beim ersten Besuch von „Heute“ wirst du gefragt, z. B. 160 g statt 180 g Protein. Später änderbar unter Einstellungen → Meine Ziele.',
    },
    {
      icon: IconToday,
      title: '3 · Jeden Tag einchecken',
      text: 'Öffne täglich „Heute“ und hake ab, was du geschafft hast: Training, Kreatin, Protein, Wasser … Dazu Gewicht und eine kurze Notiz, wenn du magst. Alles speichert automatisch – es gibt keinen Speichern-Knopf.',
    },
    {
      icon: IconBell,
      title: ios
        ? '4 · App installieren & Push aktivieren (wichtig auf dem iPhone!)'
        : '4 · Push-Benachrichtigungen aktivieren',
      text: ios
        ? 'Damit Erinnerungen ankommen: Tippe in Safari auf Teilen → „Zum Home-Bildschirm“, öffne GymPact dann VON DORT und gehe zu Einstellungen → Benachrichtigungen → „Aktivieren“. Ohne diesen Schritt kann dein iPhone keine Push-Nachrichten empfangen.'
        : 'Gehe zu Einstellungen → Benachrichtigungen und tippe bei „Dieses Gerät“ auf „Aktivieren“. Dann bekommst du Erinnerungen auch, wenn die App geschlossen ist. Tipp: Installiere die App über das Browser-Menü („App installieren“) auf deinem Startbildschirm.',
    },
    {
      icon: IconShare,
      title: '5 · Motiviert euch gegenseitig',
      text: 'Unter „Gruppe“ siehst du, was bei den anderen heute noch offen ist – tippe auf eine offene Gewohnheit, um freundlich zu erinnern. Erinnerungen sind nie anonym und auf 1× pro Tag und Gewohnheit begrenzt.',
    },
    {
      icon: IconProgress,
      title: '6 · Fortschritt verfolgen',
      text: 'Unter „Fortschritt“ findest du deine Serien, den Kalender und den Gewichtsverlauf – und mit dem Schalter „Gruppe“ die gemeinsame Ansicht: wer wie weit ist und was dem Team heute noch fehlt.',
    },
  ];
}

interface OnboardingGuideProps {
  onClose: () => void;
}

export function OnboardingGuide({ onClose }: OnboardingGuideProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const steps = buildSteps(isIos());

  const finish = (goToGroup: boolean) => {
    if (user) {
      try {
        localStorage.setItem(storageKey(user.id), '1');
      } catch {
        /* ignorieren */
      }
    }
    onClose();
    if (goToGroup) navigate('/group');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Willkommen bei GymPact"
      className="fixed inset-0 z-50 overflow-y-auto bg-surface-50 dark:bg-surface-950"
      style={{
        paddingTop: 'calc(var(--safe-top) + 1rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 1rem)',
      }}
    >
      <div className="mx-auto max-w-lg px-5 pb-8">
        <div className="animate-fade-up text-center">
          <span className="text-2xl font-bold tracking-tight text-brand-700 dark:text-brand-300">
            Willkommen bei GymPact! 💪
          </span>
          <p className="mt-2 text-sm text-surface-900/60 dark:text-surface-100/60">
            Eure private Fitness-Challenge – so legst du los:
          </p>
        </div>

        <ol className="mt-6 space-y-3">
          {steps.map((step) => (
            <li key={step.title} className="card animate-fade-up flex gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                <step.icon size={20} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-surface-900/70 dark:text-surface-100/70">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-2">
          <Button className="w-full" onClick={() => finish(true)}>
            Los geht’s – zur Gruppe
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => finish(false)}>
            Später – erstmal umschauen
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-surface-900/40 dark:text-surface-100/40">
          Du findest diese Anleitung jederzeit wieder unter Einstellungen.
        </p>
      </div>
    </div>
  );
}

/**
 * Zeigt die Einleitung automatisch beim ersten Besuch nach der
 * Registrierung (pro Gerät). Rückgabe: Steuerfunktionen für manuelles
 * Öffnen (Einstellungen).
 */
export function useOnboarding(): { open: boolean; show: () => void; close: () => void } {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user && !hasSeenOnboarding(user.id)) {
      setOpen(true);
    }
  }, [user]);

  return {
    open,
    show: () => setOpen(true),
    close: () => setOpen(false),
  };
}
