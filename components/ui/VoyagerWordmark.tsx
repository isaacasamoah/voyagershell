"use client";

import { useId } from 'react';

interface VoyagerWordmarkProps {
  variant?: 'hero' | 'dock';
  shell?: boolean;
  className?: string;
}

export const VoyagerWordmark = ({ variant = 'hero', shell = false, className = '' }: VoyagerWordmarkProps) => {
  const id = useId().replace(/:/g, '');
  const isDock = variant === 'dock';
  const label = shell ? 'VOYAGERSHELL' : 'VOYAGER';

  if (isDock) {
    return (
      <span
        className={`relative inline-flex h-8 items-center font-black uppercase text-[13px] sm:text-sm leading-none pointer-events-none select-none ${className}`}
        style={{ filter: 'drop-shadow(0 0 10px rgba(155, 122, 245, 0.2))' }}
        aria-label={label}
        role="img"
      >
        <span aria-hidden="true" className="inline-flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5f56] via-[#f4e04d] to-[#59a5ff]">
            VOYAGER
          </span>
          <span
            className={`overflow-hidden whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-[#59a5ff] to-[#b07af5] transition-[max-width,opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              shell ? 'max-w-[4.4rem] opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-1'
            }`}
          >
            SHELL
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-[#ff5f56] via-[#5ec98f] to-[#b07af5] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            shell ? 'w-full opacity-80' : 'w-[58%] opacity-45'
          }`}
        />
      </span>
    );
  }

  const viewBox = isDock ? '0 -35 640 300' : '-90 -50 820 300';
  const widthClass = isDock ? 'w-36 h-10' : 'w-[92vw] max-w-[600px]';
  const fontSize = isDock ? '62' : '80';
  const letterSpacing = isDock ? '18' : '26';
  const arcPath = isDock ? 'M 72 235 A 270 270 0 0 1 568 235' : 'M 40 235 A 300 300 0 0 1 600 235';

  return (
    <svg
      viewBox={viewBox}
      className={`${widthClass} relative z-0 pointer-events-none select-none ${className}`}
      style={{ filter: 'drop-shadow(0 0 14px rgba(155, 122, 245, 0.18))' }}
      aria-label="VOYAGER"
      role="img"
    >
      <defs>
        <linearGradient id={`voyager-rainbow-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff5f56" />
          <stop offset="20%" stopColor="#f7a34b" />
          <stop offset="40%" stopColor="#f4e04d" />
          <stop offset="60%" stopColor="#5ec98f" />
          <stop offset="80%" stopColor="#59a5ff" />
          <stop offset="100%" stopColor="#b07af5" />
        </linearGradient>
        <path id={`voyager-arc-${id}`} d={arcPath} fill="none" />
      </defs>
      {[9, 8, 7, 6, 5, 4, 3].map((depth) => (
        <g key={depth} transform={`translate(${depth}, ${depth + 2})`}>
          <text
            fill={depth > 6 ? '#12071f' : '#2a1245'}
            fontSize={fontSize}
            fontWeight="900"
            letterSpacing={letterSpacing}
            fontFamily="var(--font-geist-mono), ui-monospace, monospace"
          >
            <textPath href={`#voyager-arc-${id}`} startOffset="50%" textAnchor="middle">
              VOYAGER
            </textPath>
          </text>
        </g>
      ))}
      <text
        fill={`url(#voyager-rainbow-${id})`}
        stroke="#fff7e6"
        strokeWidth="0.75"
        fontSize={fontSize}
        fontWeight="900"
        letterSpacing={letterSpacing}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
      >
        <textPath href={`#voyager-arc-${id}`} startOffset="50%" textAnchor="middle">
          VOYAGER
        </textPath>
      </text>
    </svg>
  );
};
