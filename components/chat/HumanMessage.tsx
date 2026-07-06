"use client";

import { useEffect, useRef } from 'react';

// An inter-human message in the feed — Voyager is the courier, the sender is
// the voice. Human-orange per the design language (orange = the human).

interface HumanMessageProps {
  senderName: string;
  content: string;
  timestamp: string; // ISO
  onSeen?: () => void;
}

export const HumanMessage = ({ senderName, content, timestamp, onSeen }: HumanMessageProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSeenRef = useRef(false);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onSeen) return;

    const markIfVisible = () => {
      if (hasSeenRef.current || document.visibilityState !== 'visible') return;
      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const visible = rect.top < viewportHeight && rect.bottom > 0;
      if (!visible) return;

      hasSeenRef.current = true;
      onSeen();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) markIfVisible();
      },
      { threshold: 0.25 },
    );
    observer.observe(root);
    document.addEventListener('visibilitychange', markIfVisible);
    markIfVisible();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', markIfVisible);
    };
  }, [onSeen]);

  return (
    <div ref={rootRef} className="flex gap-4">
      <div className="w-12 pt-1 text-right text-[#f7a34b]/50 text-[10px] font-bold tracking-widest">
        {time}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[#f7a34b] text-[10px] uppercase tracking-wider mb-1 font-bold">
          {senderName}
        </div>
        <div className="relative pl-2 border-l-2 border-[#f7a34b]/40">
          <div className="text-slate-200 leading-relaxed break-words">{content}</div>
        </div>
      </div>
    </div>
  );
};
