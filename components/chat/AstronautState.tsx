"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

// =============================================================================
// The astronaut as a character with gestures, not poses.
//
// Semantic states (from useAstronautState) map to SCENES. A scene is a settled
// hold (one frame, or an alternating pair for the reading loop) plus optional
// enter/exit gesture sequences. Thinking = consulting the ship's log:
//
//   idle ──(tool fires)──▶ book-out ▶ reading ⇆ page-turn
//   reading ──(answer arrives)──▶ book-away ▶ STRETCH ▶ idle
//   error / celebrating interrupt directly (no gesture — honesty over theatre)
//
// Gestures are atomic: a state change mid-gesture is remembered and played
// out at the next settle. This keeps fast multi-tool turns from thrashing.
// =============================================================================

const A = '/images/astronaut';

interface Step { src: string; holdMs: number; fadeMs: number }

const step = (src: string, holdMs: number, fadeMs = 180): Step => ({ src, holdMs, fadeMs });

// The got-it beat: close the log, limber up, settle. Reuses the stretch
// frames exactly like the landing's cycle: peak, then a slow ease straight
// back to idle (no settling frame — its raised hand reads as re-grabbing
// the book right after the stretch).
const STRETCH_OUT: Step[] = [
  step(`${A}/book-frames/book-away.png`, 520),
  step(`${A}/stretch-frames/frame-1-uncrossing.png`, 90, 120),
  step(`${A}/stretch-frames/frame-2-stretched.png`, 120, 120),
  step(`${A}/stretch-frames/frame-3-peak-stretch.png`, 950, 200),
];

const BOOK_OUT: Step[] = [step(`${A}/book-frames/book-out.png`, 560, 260)];
const BOOK_AWAY: Step[] = [step(`${A}/book-frames/book-away.png`, 480, 220)];

type AstronautStateType = 'idle' | 'reading' | 'error' | 'celebrating';

interface Scene {
  hold: string[];          // 1 frame, or an alternating pair (page turns)
  alt: string;
  animation: string;       // float class while settled
  enter?: Step[];
  /** Exit gesture keyed by destination; 'default' covers the rest. */
  exit?: Partial<Record<AstronautStateType | 'default', Step[]>>;
}

const SCENES: Record<AstronautStateType, Scene> = {
  idle: {
    hold: [`${A}/idle.png`],
    alt: 'Voyager at rest',
    animation: 'animate-float-idle',
  },
  reading: {
    hold: [`${A}/book-frames/reading-1.png`, `${A}/book-frames/reading-2.png`],
    alt: "Voyager consulting the ship's log",
    animation: 'animate-float-idle',
    enter: BOOK_OUT,
    exit: {
      idle: STRETCH_OUT,     // answer arrived — the satisfying beat
      celebrating: BOOK_AWAY,
      default: [],           // errors interrupt; no theatre
    },
  },
  error: {
    hold: [`${A}/error.png`],
    alt: 'Voyager hit a snag',
    animation: 'animate-float-error',
  },
  celebrating: {
    hold: [`${A}/celebrating.png`],
    alt: 'Voyager celebrating',
    animation: 'animate-float-celebrating',
  },
};

const ALL_FRAMES = Array.from(
  new Set(
    Object.values(SCENES).flatMap((s) => [
      ...s.hold,
      ...(s.enter ?? []).map((st) => st.src),
      ...Object.values(s.exit ?? {}).flat().map((st) => st.src),
    ]),
  ),
);

const PAGE_TURN_AMBIENT_MS = 3600; // page turns while thinking, absent tool beats
const SETTLE_FADE_MS = 500; // slow ease into the hold — matches the landing's stretch return

const sizeClasses = {
  sm: 'w-20 h-20',
  md: 'w-32 h-32',
  lg: 'w-48 h-48',
  xl: 'w-64 h-64',
};

interface AstronautStateProps {
  state: AstronautStateType;
  /** Increment on each tool call — turns a page while reading. */
  beat?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const AstronautState = ({ state, beat = 0, size = 'md', className = '' }: AstronautStateProps) => {
  // Two-layer crossfade (the landing's proven engine): back always visible,
  // front fades in over it, then promotes to back.
  const [backSrc, setBackSrc] = useState(SCENES[state].hold[0]);
  const [frontSrc, setFrontSrc] = useState<string | null>(null);
  const [frontOn, setFrontOn] = useState(false);
  const [fadeMs, setFadeMs] = useState(SETTLE_FADE_MS);
  const [settled, setSettled] = useState<AstronautStateType>(state);

  const targetRef = useRef(state);
  const settledRef = useRef(state);
  const busyRef = useRef(false);
  const holdIndexRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number>(0);

  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  const crossfadeTo = useCallback((src: string, ms: number, onDone: () => void) => {
    setFadeMs(ms);
    setFrontSrc(src);
    setFrontOn(false);
    rafRef.current = requestAnimationFrame(() => setFrontOn(true));
    after(ms, () => {
      setBackSrc(src);
      setFrontSrc(null);
      setFrontOn(false);
      onDone();
    });
  }, [after]);

  // The sequencer: settle → (exit gesture) → (enter gesture) → settle.
  const pump = useCallback(() => {
    if (busyRef.current) return;
    const from = settledRef.current;
    const to = targetRef.current;
    if (from === to) return;

    busyRef.current = true;
    const exitSteps = SCENES[from].exit?.[to] ?? SCENES[from].exit?.default ?? [];
    const enterSteps = SCENES[to].enter ?? [];
    const steps = [...exitSteps, ...enterSteps];

    const playFrom = (i: number) => {
      if (i < steps.length) {
        const s = steps[i];
        crossfadeTo(s.src, s.fadeMs, () => after(s.holdMs, () => playFrom(i + 1)));
        return;
      }
      // Settle into the destination hold.
      holdIndexRef.current = 0;
      crossfadeTo(SCENES[to].hold[0], SETTLE_FADE_MS, () => {
        settledRef.current = to;
        setSettled(to);
        busyRef.current = false;
        pump(); // target may have moved while we gestured
      });
    };
    playFrom(0);
  }, [after, crossfadeTo]);

  useEffect(() => {
    targetRef.current = state;
    pump();
  }, [state, pump]);

  // Page turns while reading: on each tool beat, plus a slow ambient rhythm.
  const turnPage = useCallback(() => {
    if (busyRef.current || settledRef.current !== 'reading') return;
    const pair = SCENES.reading.hold;
    holdIndexRef.current = (holdIndexRef.current + 1) % pair.length;
    crossfadeTo(pair[holdIndexRef.current], 240, () => {});
  }, [crossfadeTo]);

  useEffect(() => {
    if (settled === 'reading' && beat > 0) turnPage();
  }, [beat, settled, turnPage]);

  useEffect(() => {
    if (settled !== 'reading') return;
    const t = setInterval(turnPage, PAGE_TURN_AMBIENT_MS);
    return () => clearInterval(t);
  }, [settled, turnPage]);

  // Preload every frame once so gestures never pop.
  useEffect(() => {
    ALL_FRAMES.forEach((src) => { new Image().src = src; });
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scene = SCENES[settled];

  return (
    <div className={`relative transition-all duration-700 ease-in-out ${sizeClasses[size]} ${className}`}>
      <div className={`w-full h-full ${scene.animation}`}>
        {/* Back layer — always visible */}
        <img src={backSrc} alt={scene.alt} className="absolute inset-0 w-full h-full object-contain" />
        {/* Front layer — fades in during transitions */}
        {frontSrc && (
          <img
            src={frontSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ opacity: frontOn ? 1 : 0, transition: `opacity ${fadeMs}ms ease-in-out` }}
          />
        )}
      </div>
    </div>
  );
};
