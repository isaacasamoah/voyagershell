'use client'

import { useState } from 'react';
import { AstronautState } from '@/components/chat/AstronautState';

const states = ['idle', 'reading', 'error', 'listening', 'celebrating'] as const;
type S = (typeof states)[number];

// Gesture playground: switch states to watch the book-out / page-turn /
// stretch choreography exactly as the app drives it.
export default function AstronautPreviewPage() {
  const [state, setState] = useState<S>('idle');
  const [beat, setBeat] = useState(0);

  return (
    <div className="min-h-screen bg-[#050505] p-8 font-mono">
      <h1 className="text-2xl text-slate-300 mb-8">Voyager Astronaut — gesture playground</h1>

      <div className="flex flex-col items-center gap-6 p-8 rounded-lg border border-white/10 bg-white/5 max-w-xl">
        <AstronautState state={state} beat={beat} size="xl" />
        <div className="flex gap-2 flex-wrap justify-center">
          {states.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`px-3 py-1.5 rounded-sm border text-xs transition ${
                state === s
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBeat((b) => b + 1)}
            className="px-3 py-1.5 rounded-sm border border-white/10 text-slate-400 hover:bg-white/5 text-xs transition"
          >
            tool beat (page turn)
          </button>
        </div>
        <p className="text-xs text-slate-500 text-center max-w-md">
          idle → reading plays book-out · reading → idle plays book-away + the stretch ·
          reading → listening shelves the book · error/celebrating interrupt directly
        </p>
      </div>
    </div>
  );
}
