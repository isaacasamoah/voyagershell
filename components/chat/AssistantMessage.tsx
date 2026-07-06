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
}

export const AssistantMessage = ({
  content,
  parts,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  isStreaming = false,
  onAction,
}: AssistantMessageProps) => {
  // Normalize to parts array
  const messageParts: MessagePart[] = parts ?? (content ? [{ type: 'text', text: content }] : []);

  return (
    <div className="flex gap-4">
      <div className="w-12 pt-1 text-right text-[#b07af5]/55 text-[10px] font-bold tracking-widest">
        {timestamp}
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        <div className="relative pl-2">
          {/* Label — no astronaut in messages (AC2) */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5f56] via-[#5ec98f] to-[#b07af5] text-xs font-bold">
              VOYAGER
            </span>
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
        </div>
      </div>
    </div>
  );
};
