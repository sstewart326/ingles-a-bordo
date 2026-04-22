import { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import {
  birthdayStorageKeyForUser,
  isBirthdayToday
} from '../utils/birthdayUtils';

const CONFETTI_MS = 5000;
const SPARKLE_INTERVAL = 120;
const CELEBRATED_NO_DISMISS_MS = 6000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export const BirthdayCelebration: React.FC = () => {
  const { currentUser } = useAuthWithMasquerade();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const reducedMotion = usePrefersReducedMotion();
  const [show, setShow] = useState(false);
  const [greetingName, setGreetingName] = useState('');
  const confettiStartedRef = useRef(false);

  const uid = currentUser?.uid;
  const storageKey = uid ? birthdayStorageKeyForUser(uid) : '';

  const doMarkCelebrated = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // ignore private mode / quota
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!uid) {
      setShow(false);
      return;
    }

    const q = query(collection(db, 'users'), where('uid', '==', uid));

    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setShow(false);
          return;
        }
        const key = birthdayStorageKeyForUser(uid);
        if (localStorage.getItem(key)) {
          setShow(false);
          return;
        }
        const data = snapshot.docs[0].data();
        const birthdate = data.birthdate as string | undefined;
        if (!isBirthdayToday(birthdate)) {
          setShow(false);
          return;
        }
        const name = (data.name as string) || currentUser?.email?.split('@')[0] || '';
        setGreetingName(name);
        setShow(true);
      },
      (err) => {
        console.error('Birthday celebration listener:', err);
      }
    );
  }, [uid, currentUser?.email]);

  // Confetti stream (not when reduced motion)
  useEffect(() => {
    if (!show || !storageKey) return;
    if (reducedMotion) return;
    if (confettiStartedRef.current) return;
    confettiStartedRef.current = true;

    const colors = [
      '#f97316',
      '#eab308',
      '#22c55e',
      '#3b82f6',
      '#a855f7',
      '#ec4899',
      '#f43f5e',
      '#06b6d4',
      '#ffffff'
    ];
    const burst = (originX: number) =>
      void confetti({
        particleCount: 90,
        spread: 120,
        startVelocity: 55,
        origin: { x: originX, y: 0.02 },
        angle: 90,
        gravity: 1.05,
        ticks: 380,
        scalar: 1.2,
        decay: 0.92,
        shapes: ['square', 'circle'],
        colors,
        zIndex: 10040
      });
    const tick = () => {
      const u = Math.random() * 0.55 + 0.1;
      burst(u);
      burst(u + 0.32);
    };
    tick();
    const intervalId = window.setInterval(tick, SPARKLE_INTERVAL);
    const doneId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      doMarkCelebrated();
    }, CONFETTI_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(doneId);
    };
  }, [show, storageKey, reducedMotion, doMarkCelebrated]);

  useEffect(() => {
    if (!show) {
      confettiStartedRef.current = false;
    }
  }, [show]);

  // After celebration window without dismiss (e.g. reduced motion or slow readers), mark so refresh does not repeat
  useEffect(() => {
    if (!show || !storageKey) return;
    if (!reducedMotion) return;
    const id = window.setTimeout(() => {
      doMarkCelebrated();
    }, CELEBRATED_NO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [show, storageKey, reducedMotion, doMarkCelebrated]);

  const handleDismiss = () => {
    doMarkCelebrated();
    setShow(false);
  };

  if (!currentUser || !show) {
    return null;
  }

  const title =
    greetingName.trim() !== ''
      ? t.happyBirthdayGreeting.replace('{name}', greetingName)
      : t.happyBirthdayGeneric;

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col items-center justify-start pt-16 sm:pt-20 px-4 pointer-events-none"
      aria-live="polite"
      role="dialog"
      aria-label={title}
    >
      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl bg-white/95 px-5 pb-5 pt-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm text-center sm:px-6 sm:pt-5 sm:pb-6">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label={t.birthdayClose}
        >
          <XMarkIcon className="h-6 w-6" aria-hidden />
        </button>
        <p className="pr-10 text-2xl sm:text-3xl font-semibold text-slate-800">
          <span className="mr-1.5 inline-block" aria-hidden>
            🎂
          </span>
          {title}
        </p>
        <p className="mt-2 text-sm text-slate-600">{t.happyBirthdaySubtext}</p>
      </div>
    </div>
  );
};
