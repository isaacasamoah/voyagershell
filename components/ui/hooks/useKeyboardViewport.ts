'use client';

import { useEffect, useState } from 'react';

// Mobile keyboard awareness via the visualViewport API.
// keyboardInset: how much of the layout viewport the keyboard covers (px) —
// fixed-bottom elements translate up by this to ride the keyboard.
// composing: keyboard open on a phone-width screen — drives the astronaut's
// step-aside (composing mode).
export const useKeyboardViewport = () => {
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let simulated = false;

    const measure = () => {
      if (simulated) return; // simulator owns the state while active
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const phoneWidth = window.matchMedia('(max-width: 639px)').matches;
      setKeyboardInset(inset);
      // 140px threshold separates keyboards from browser-chrome collapses
      setComposing(phoneWidth && inset > 140);
    };

    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    measure();

    // Dev-only simulator: window.__vkb(inset) drives the same state so the
    // keyboard transition can be tuned/recorded in a desktop browser. The
    // composing reflow itself fires visualViewport events, so live
    // measurement is suppressed while a simulated inset is active.
    // Stripped from production bundles by the NODE_ENV guard.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __vkb?: (inset: number) => void }).__vkb = (inset: number) => {
        simulated = inset > 0;
        const phoneWidth = window.matchMedia('(max-width: 639px)').matches;
        setKeyboardInset(inset);
        setComposing(phoneWidth && inset > 140);
      };
    }

    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  return { keyboardInset, composing };
};
