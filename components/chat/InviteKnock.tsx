"use client";

import React, { useState } from 'react';
import type { InviteMembershipState, InviteState } from '@/lib/messaging/feed-types';

// The inline room knock — one Join, one Decline. The click IS the accept
// (deterministic, server-authoritative via /api/room/invite/respond) — no LLM
// in the path. Only the invitee ever sees this event in their feed.

interface InviteKnockProps {
  content: string;
  senderName: string;
  timestamp: string; // ISO
  inviteState: InviteState | null;
  conversationId: string | null;
}

export const InviteKnock = ({ content, senderName, timestamp, inviteState, conversationId }: InviteKnockProps) => {
  const [state, setState] = useState<InviteMembershipState | null>(inviteState?.membership ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const unavailable = inviteState === null;

  const respond = async (accept: boolean) => {
    if (!conversationId || !inviteState?.spaceId || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/room/invite/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, spaceId: inviteState.spaceId, accept }),
      });
      const result = await res.json() as { responded?: boolean };
      if (res.ok && result.responded === true) setState(accept ? 'active' : 'left');
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const pending = state === 'invited';

  return (
    <div className="flex gap-4">
      <div className="w-12 pt-1 text-right text-[#f7a34b]/50 text-[10px] font-bold tracking-widest">
        {time}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[#f7a34b] text-[10px] uppercase tracking-wider mb-1 font-bold">
          {senderName}
        </div>
        <div className="relative pl-2 border-l-2 border-[#f7a34b]/40">
          <div className="text-slate-200 leading-relaxed break-words">
            {unavailable
              ? `This older invitation can’t be joined. Ask ${senderName} to send it again.`
              : content}
          </div>

          {pending && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => respond(true)}
                disabled={busy}
                className="px-3 py-1 rounded-full bg-[#f7a34b] text-slate-900 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-[#f7a34b]/90 transition-colors"
              >
                Join
              </button>
              <button
                type="button"
                onClick={() => respond(false)}
                disabled={busy}
                className="px-3 py-1 rounded-full border border-[#f7a34b]/40 text-[#f7a34b]/80 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50 hover:border-[#f7a34b]/70 transition-colors"
              >
                Decline
              </button>
              {failed && (
                <span className="text-[11px] text-red-400/80">Couldn&apos;t respond — try again.</span>
              )}
            </div>
          )}

          {state === 'active' && (
            <div className="mt-2 text-[11px] text-[#f7a34b]/70 uppercase tracking-wider font-bold">
              ✓ You joined the room
            </div>
          )}
          {state === 'left' && (
            <div className="mt-2 text-[11px] text-slate-500 uppercase tracking-wider font-bold">
              Declined
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
