"use client";

import { useEffect, useRef } from 'react';

// A quiet, centered room event — "X joined the room". Not attributed to a
// person's voice; it's the room narrating itself. Arrives on the same realtime
// lane as messages, so it lands the instant the join happens.

interface SystemLineProps {
  content: string;
  onSeen?: () => void;
}

export const SystemLine = ({ content, onSeen }: SystemLineProps) => {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !onSeen) return;
    firedRef.current = true;
    onSeen();
  }, [onSeen]);

  return (
    <div className="flex justify-center py-1">
      <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
        {content}
      </div>
    </div>
  );
};
