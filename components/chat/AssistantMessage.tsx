"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ComponentRenderer } from '@/components/ui/composition';
import type { InlineComponent } from '@/lib/ui/components';

// Message parts - text, component, or custom React element
export interface MessagePart {
  type: 'text' | 'component' | 'react'
  text?: string
  component?: InlineComponent
  element?: React.ReactNode
}

interface AssistantMessageProps {
  // Simple string for backwards compatibility
  content?: string;
  // Rich parts for mixed content
  parts?: MessagePart[];
  timestamp?: string;
  isStreaming?: boolean;
  onAction?: (action: string, data?: unknown) => void;
  // Private Voyager rows receive the owner's canonical current companion name;
  // null uses the VOYAGER brand fallback. Historical public rows keep their
  // immutable name + owner attribution.
  voyagerName?: string | null;
  ownerName?: string | null;
  audienceLabel?: string;
  shareTarget?: string;
  shared?: boolean;
  onShare?: () => Promise<void>;
}

export const AssistantMessage = ({
  content,
  parts,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  isStreaming = false,
  onAction,
  voyagerName,
  ownerName,
  audienceLabel,
  shareTarget,
  shared = false,
  onShare,
}: AssistantMessageProps) => {
  const [shareOpen, setShareOpen] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [shareError, setShareError] = React.useState<string | null>(null);
  // Normalize to parts array
  const messageParts: MessagePart[] = parts ?? (content ? [{ type: 'text', text: content }] : []);

  const confirmShare = async () => {
    if (!onShare || sharing || shared) return;
    setSharing(true);
    setShareError(null);
    try {
      await onShare();
      setShareOpen(false);
    } catch {
      setShareError('Share failed. Nothing was posted.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex gap-4">
      <div className="w-12 pt-1 text-right text-[#b07af5]/55 text-[10px] font-bold tracking-widest">
        {timestamp}
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        <div className="relative pl-2">
          {/* Label — no astronaut in messages. Private rows use current identity;
              historical public rows keep their stored name + owner attribution. */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5f56] via-[#5ec98f] to-[#b07af5] text-xs font-bold">
              {voyagerName ? voyagerName.toUpperCase() : 'VOYAGER'}
            </span>
            {voyagerName && (
              <span className="text-[#b07af5] text-xs font-bold" aria-label="AI">✦</span>
            )}
            {voyagerName && ownerName && (
              <span className="text-slate-500 text-[10px] font-medium tracking-wide">
                ({ownerName}&rsquo;s Voyager)
              </span>
            )}
            {audienceLabel && (
              <span className="text-slate-500 text-[9px] font-medium tracking-wide">
                {audienceLabel}
              </span>
            )}
            {isStreaming && (
              <span className="text-[#59a5ff] text-[10px] animate-pulse">streaming...</span>
            )}
          </div>

          {/* Response Content */}
          <div className="relative ml-0 pl-4">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-[#b07af5] via-[#59a5ff] to-[#5ec98f] opacity-70" />
            <div className="text-slate-300 leading-relaxed text-sm prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:text-slate-200 prose-headings:font-bold prose-code:text-indigo-300 prose-code:bg-slate-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-a:text-indigo-400 prose-strong:text-slate-200 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 space-y-3 break-words">
              {messageParts.map((part, i) =>
                part.type === 'text' && part.text ? (
                  <ReactMarkdown key={i}>{part.text}</ReactMarkdown>
                ) : part.type === 'component' && part.component ? (
                  <div key={i} className="not-prose my-3">
                    <ComponentRenderer
                      component={part.component}
                      onAction={onAction}
                    />
                  </div>
                ) : part.type === 'react' && part.element ? (
                  <div key={i} className="not-prose my-3">
                    {part.element}
                  </div>
                ) : null
              )}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-[#b07af5] ml-1 animate-pulse" />
              )}
            </div>
          </div>

          {onShare && shareTarget && !isStreaming && (
            <div className="ml-4 mt-3">
              <button
                type="button"
                onClick={() => setShareOpen((open) => !open)}
                disabled={shared}
                className="text-[10px] tracking-wide text-[#5ec98f] hover:text-[#8de0b5] disabled:text-slate-600 transition-colors"
              >
                {shared ? `Shared to ${shareTarget}` : `Share to ${shareTarget}`}
              </button>
              {shareOpen && !shared && (
                <div className="mt-2 max-w-xl border border-[#5ec98f]/25 bg-[#5ec98f]/[0.04] p-3 text-xs">
                  <div className="text-slate-300 mb-2">Share exactly this Voyager response to {shareTarget} as your message?</div>
                  <div className="max-h-32 overflow-y-auto border-l-2 border-[#5ec98f]/40 pl-3 text-slate-400 whitespace-pre-wrap">
                    {content}
                  </div>
                  {shareError && <div className="mt-2 text-[#ff8b84]">{shareError}</div>}
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={confirmShare}
                      disabled={sharing}
                      className="text-[#5ec98f] hover:text-[#8de0b5] disabled:text-slate-600"
                    >
                      {sharing ? 'Sharing…' : 'Confirm share'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareOpen(false)}
                      disabled={sharing}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
