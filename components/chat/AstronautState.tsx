"use client";

import React, { useState, useEffect, useRef } from 'react';

const ASSETS = {
  searching: "/images/astronaut/searching.png",
  idle: "/images/astronaut/idle.png",
  error: "/images/astronaut/error.png",
  listening: "/images/astronaut/listening.png",
  celebrating: "/images/astronaut/celebrating.png",
};

type AstronautStateType = 'idle' | 'searching' | 'error' | 'listening' | 'celebrating';

interface AstronautStateProps {
  state: AstronautStateType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const stateConfig = {
  idle: {
    src: ASSETS.idle,
    alt: 'Voyager at rest',
    animation: 'animate-float-idle',
  },
  searching: {
    src: ASSETS.searching,
    alt: 'Voyager searching',
    animation: 'animate-float-searching',
  },
  error: {
    src: ASSETS.error,
    alt: 'Voyager encountered an error',
    animation: 'animate-float-error',
  },
  listening: {
    src: ASSETS.listening,
    alt: 'Voyager listening',
    animation: 'animate-float-listening',
  },
  celebrating: {
    src: ASSETS.celebrating,
    alt: 'Voyager celebrating',
    animation: 'animate-float-celebrating',
  },
};

const sizeClasses = {
  sm: 'w-20 h-20',   // 80px
  md: 'w-32 h-32',   // 128px
  lg: 'w-48 h-48',   // 192px
  xl: 'w-64 h-64',   // 256px
};

/**
 * Crossfade between astronaut states for smooth animation transitions.
 * Two overlapping <img> layers — outgoing fades out while incoming fades in.
 * This prevents the jarring position snap when CSS animation classes swap.
 */
export const AstronautState = ({ state, size = 'md', className = '' }: AstronautStateProps) => {
  const [displayState, setDisplayState] = useState(state);
  const [prevState, setPrevState] = useState<AstronautStateType | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (state !== displayState) {
      // Start crossfade: show both layers, outgoing fades out
      setPrevState(displayState);
      setDisplayState(state);

      // Clear outgoing layer after fade completes
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => setPrevState(null), 600);
    }
  }, [state, displayState]);

  useEffect(() => {
    return () => clearTimeout(fadeTimerRef.current);
  }, []);

  const current = stateConfig[displayState];

  return (
    <div className={`relative transition-all duration-700 ease-in-out ${sizeClasses[size]} ${className}`}>
      {/* Outgoing layer — fades out over 600ms, preserves animation position */}
      {prevState && (
        <img
          src={stateConfig[prevState].src}
          alt={stateConfig[prevState].alt}
          className={`absolute inset-0 w-full h-full object-contain ${stateConfig[prevState].animation} transition-opacity duration-500 ease-in-out opacity-0`}
        />
      )}
      {/* Current layer — fades in */}
      <img
        src={current.src}
        alt={current.alt}
        className={`w-full h-full object-contain ${current.animation} transition-opacity duration-500 ease-in-out ${prevState ? 'opacity-100' : ''}`}
      />
    </div>
  );
};
