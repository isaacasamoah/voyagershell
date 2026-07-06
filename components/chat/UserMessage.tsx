"use client";

import React from 'react';

interface UserMessageProps {
  content: string;
  timestamp?: string;
  username?: string;
}

export const UserMessage = ({
  content,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  username = 'you'
}: UserMessageProps) => {
  return (
    <div className="flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
      <div className="w-12 pt-1 text-right text-[#f7a34b]/45 text-[10px] font-bold tracking-widest">
        {timestamp}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[#f7a34b] text-[10px] uppercase tracking-wider mb-1 font-bold">
          {username}
        </div>
        <div className="text-slate-200 leading-relaxed border-l-2 border-[#f7a34b]/35 pl-4 break-words">
          {content}
        </div>
      </div>
    </div>
  );
};
