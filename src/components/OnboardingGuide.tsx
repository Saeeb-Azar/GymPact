// Einleitung: erscheint nach der ersten Anmeldung (pro Gerät, localStorage)
// und stellt die drei Bereiche vor. In den Einstellungen wieder aufrufbar.

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from './ui/basics';
import { IconChart, IconDumbbell, IconFood, IconSparkles } from './icons';

const STORAGE_PREFIX = 'gympact-onboarding-v2-';

export function hasSeenOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === '1';
  } catch {
    return true;
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, '1');
  } catch {
    /* ignorieren */
  }
}

const STEPS = [
  {
    icon: IconSparkles,
    title: 'Willkommen beim neuen GymPact',
    text: 'Keine Challenges mehr – hier geht es nur um deinen Fortschritt. Ernährung, Training und Statistiken an einem Ort.',
    gradient: 'from-brand-400/40 to-violet-500/30',
  },
  {
    icon: IconFood,
    title: 'Ernährung tracken',
    text: 'Trag dein Essen pro Mahlzeit ein – aus deiner Bibliothek, der Open-Food-Facts-Datenbank oder als Schnell-Eintrag. Kalorien, Protein, Kohlenhydrate, Fett und Wasser im Blick.',
    gradient: 'from-amber-400/40 to-pink-500/30',
  },
  {
    icon: IconDumbbell,
    title: 'Trainingsplan in Wochen',
    text: 'Leg jede Woche deine Einheiten an, schreib Übungen mit Gewicht und Wiederholungen auf – und übernimm mit einem Tipp die Vorwoche, um dich zu steigern.',
    gradient: 'from-violet-500/40 to-sky-400/30',
  },
  {
    icon: IconChart,
    title: 'Statistiken, die motivieren',
    text: 'Kalorienverlauf, Makroverteilung, Körpergewicht, Trainingsvolumen und Bestleistungen je Übung – übersichtlich aufbereitet – dazu eine Muskelkarte deines Körpers.',
    gradient: 'from-sky-400/40 to-brand-400/30',
  },
];

export function OnboardingGuide({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  const finish = () => {
    if (user) markSeen(user.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-50 dark:bg-surface-950"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
        <div className="flex justify-end">
          <button type="button" onClick={finish} className="touch-target text-sm font-medium muted">
            Überspringen
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="flex flex-col items-center"
            >
              <div style={{ perspective: 600 }}>
                <motion.div
                  className={`flex h-44 w-44 items-center justify-center rounded-[2.5rem] bg-gradient-to-br ${s.gradient} text-surface-900 shadow-2xl backdrop-blur dark:text-white`}
                  initial={{ rotateY: -20, rotateX: 10, opacity: 0 }}
                  animate={{ rotateY: 0, rotateX: 0, opacity: 1 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <s.icon size={72} strokeWidth={1.4} style={{ transform: 'translateZ(40px)' }} />
                </motion.div>
              </div>
              <h1 className="mt-10 font-display text-2xl font-bold">{s.title}</h1>
              <p className="mt-3 text-base leading-relaxed muted">{s.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <motion.span
              key={i}
              className="h-2 rounded-full bg-brand-500"
              animate={{ width: i === step ? 28 : 8, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </div>
        <Button onClick={() => (last ? finish() : setStep(step + 1))} className="w-full">
          {last ? 'Los geht’s' : 'Weiter'}
        </Button>
      </div>
    </div>
  );
}

export function useOnboarding(): { open: boolean; show: () => void; close: () => void } {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user && !hasSeenOnboarding(user.id)) setOpen(true);
  }, [user]);

  return { open, show: () => setOpen(true), close: () => setOpen(false) };
}
