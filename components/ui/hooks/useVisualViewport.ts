'use client';

import { useEffect, useState } from 'react';

// The app shell sizes itself to the VISIBLE viewport, so header and input are
// just the top and bottom rows of a fixed-height box — they can't drift, and
// the keyboard simply shrinks the box (footer rides up for free, no transform).
//
// - height:    what the shell height should be right now (visualViewport.height).
//              0 until measured — the shell falls back to 100dvh via CSS.
// - offsetTop: how far iOS has panned the visual viewport down (pins the shell).
// - composing: keyboard up on a phone-width screen (used to hide the astronaut).
export const useVisualViewport = () => {
  const [height, setHeight] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let simulated = false;

    const measure = () => {
      if (simulated) return; // the dev simulator owns the state while active
      const phoneWidth = window.matchMedia('(max-width: 639px)').matches;
      const covered = window.innerHeight - vv.height; // keyboard + chrome
      setHeight(vv.height);
      setOffsetTop(vv.offsetTop); // iOS pans the visual viewport down
      // 140px separates a keyboard from mere browser-chrome collapse
      setComposing(phoneWidth && covered > 140);
    };

    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    measure();

    // Dev-only simulator: window.__vkb(inset) fakes a keyboard of `inset` px so
    // the shell can be tuned/recorded in a desktop browser. Stripped from prod.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __vkb?: (inset: number) => void }).__vkb = (inset: number) => {
        simulated = inset > 0;
        const phoneWidth = window.matchMedia('(max-width: 639px)').matches;
        setHeight(window.innerHeight - inset);
        setOffsetTop(0);
        setComposing(phoneWidth && inset > 140);
      };
    }

    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  return { height, offsetTop, composing };
};
