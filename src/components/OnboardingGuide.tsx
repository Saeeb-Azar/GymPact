// Einleitung: erscheint nach der ersten Anmeldung (pro Gerät, localStorage)
// und stellt die drei Bereiche vor. In den Einstellungen wieder aufrufbar.

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from './ui/basics';
import { BodySetupForm } from './BodySetupForm';
import { IconChart, IconDumbbell, IconFood, IconScale, IconSparkles } from './icons';

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
    gradient: 'from-brand-500/25 to-brand-500/5',
  },
  {
    icon: IconFood,
    title: 'Ernährung tracken',
    text: 'Trag dein Essen pro Mahlzeit ein – aus deiner Bibliothek, der Open-Food-Facts-Datenbank oder als Schnell-Eintrag. Kalorien, Protein, Kohlenhydrate, Fett und Wasser im Blick.',
    gradient: 'from-[#a3762a]/25 to-[#a3762a]/5',
  },
  {
    icon: IconDumbbell,
    title: 'Trainingsplan in Wochen',
    text: 'Leg jede Woche deine Einheiten an, schreib Übungen mit Gewicht und Wiederholungen auf – und übernimm mit einem Tipp die Vorwoche, um dich zu steigern.',
    gradient: 'from-[#7a7fd1]/25 to-[#7a7fd1]/5',
  },
  {
    icon: IconChart,
    title: 'Statistiken, die motivieren',
    text: 'Kalorienverlauf, Makroverteilung, Körpergewicht, Trainingsvolumen und Bestleistungen je Übung – übersichtlich aufbereitet – dazu eine Muskelkarte deines Körpers.',
    gradient: 'from-[#3d92d4]/25 to-[#3d92d4]/5',
  },
];

export function OnboardingGuide({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  // Nach den Info-Seiten folgt der Einrichtungs-Schritt „Deine Werte“ –
  // damit niemand mit den anonymen Standardzielen startet.
  const setupStep = STEPS.length;
  const isSetup = step === setupStep;
  const lastInfo = step === STEPS.length - 1;
  const s = STEPS[Math.min(step, STEPS.length - 1)];

  const finish = () => {
    if (user) markSeen(user.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-50 dark:bg-surface-950"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
        <div className="flex justify-end">
          <button type="button" onClick={finish} className="touch-target text-sm font-medium muted">
            Überspringen
          </button>
        </div>

        {isSetup ? (
          <motion.div
            key="setup"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="flex flex-1 flex-col"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
                <IconScale size={24} />
              </span>
              <div>
                <h1 className="font-display text-xl font-bold">Deine Werte</h1>
                <p className="text-sm muted">
                  Daraus berechnen wir deine Kalorien- und Makroziele.
                </p>
              </div>
            </div>
            <BodySetupForm submitLabel="Speichern & los geht’s" onDone={finish} />
            <button
              type="button"
              onClick={finish}
              className="touch-target mt-3 w-full text-center text-sm font-medium muted"
            >
              Später eintragen (Standardwerte verwenden)
            </button>
          </motion.div>
        ) : (
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
        )}

        <div className="mb-6 mt-4 flex justify-center gap-2">
          {[...STEPS, null].map((_, i) => (
            <motion.span
              key={i}
              className="h-2 rounded-full bg-brand-500"
              animate={{ width: i === step ? 28 : 8, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </div>
        {!isSetup && (
          <Button onClick={() => setStep(step + 1)} className="w-full">
            {lastInfo ? 'Weiter zu deinen Werten' : 'Weiter'}
          </Button>
        )}
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
