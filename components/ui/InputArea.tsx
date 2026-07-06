import React, { useRef, useEffect } from 'react';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder?: string;
  queueCount?: number;
}

export const InputArea = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
  queueCount = 0,
}: InputAreaProps) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep input always focused
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current && !isLoading) {
        inputRef.current.focus();
      }
    };

    focusInput();

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
        focusInput();
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex items-start gap-3 group">
      <span className={`font-bold mt-1 ${isLoading ? 'text-amber-500' : 'text-transparent bg-clip-text bg-gradient-to-b from-[#f4e04d] to-[#5ec98f] animate-pulse'}`}>&#10132;</span>
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#59a5ff] to-[#b07af5] text-xs font-bold mt-1">~/voyager</span>
      <div className="flex-1 relative">
        <textarea
          ref={inputRef}
          className="w-full bg-transparent border-none outline-none text-slate-200 placeholder-slate-600 font-mono text-sm resize-none min-h-[24px] max-h-32 overflow-y-auto"
          placeholder={placeholder ?? (isLoading ? "Type to queue message..." : "Just talk to me...")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
          }}
        />
      </div>
      {queueCount > 0 && (
        <span className="text-amber-400 text-xs font-bold mt-1 animate-pulse">
          {queueCount} queued
        </span>
      )}
      {value.trim() && (
        <button
          type="button"
          onClick={onSubmit}
          className={`text-xs font-bold transition mt-1 ${isLoading ? 'text-amber-400 hover:text-amber-300' : 'text-[#b07af5] hover:text-[#f7a34b]'}`}
        >
          {isLoading ? 'QUEUE' : 'SEND'}
        </button>
      )}
    </div>
  );
};
