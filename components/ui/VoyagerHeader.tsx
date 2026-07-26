'use client'

import { Ship, Terminal } from 'lucide-react'
import type { VoyageMembership } from '@/lib/types'
import { VoyagerWordmark } from './VoyagerWordmark'

interface VoyagerHeaderProps {
  visible: boolean
  isAuthenticated: boolean
  currentVoyage: VoyageMembership | null
  conversationTitle: string | null
  room: { people: string[]; aiPresent: boolean }
  displayName: string | null
}

export const VoyagerHeader = ({
  visible,
  isAuthenticated,
  currentVoyage,
  conversationTitle,
  room,
  displayName,
}: VoyagerHeaderProps) => {
  if (!visible) return null
  return (
    <header className="flex-none relative bg-[#050505] px-4 h-[52px] flex items-center justify-between overflow-hidden">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-indigo-400 shrink-0">
          <Terminal size={16} />
          <VoyagerWordmark variant="dock" shell />
        </div>
        {isAuthenticated && (
          <>
            <div className="h-4 w-[1px] bg-white/10 mx-1" />
            <div className="flex gap-2 overflow-hidden min-w-0">
              <div className="relative shrink-0">
                {currentVoyage ? (
                  <div className="px-2 py-1 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs flex items-center gap-2 shadow-[0_0_10px_rgba(168,85,247,0.1)] min-w-0">
                    <Ship size={10} className="shrink-0" />
                    <span className="opacity-30 font-semibold shrink-0">$VOY:</span>
                    <span className="truncate max-w-[120px]">
                      {currentVoyage.name.toUpperCase().replace(/\s+/g, '_')}
                    </span>
                  </div>
                ) : (
                  <div className="px-2 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-400 text-xs flex items-center gap-2">
                    <Ship size={10} className="shrink-0" />
                    <span className="opacity-30 font-semibold">$VOY:</span>
                    {' '}PERSONAL
                  </div>
                )}
              </div>
              <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 min-w-0">
                <span className="opacity-30 font-semibold shrink-0">$CTX:</span>
                <span className="truncate">
                  {conversationTitle || 'NEW_SESSION'}
                </span>
              </div>
              {room.people.length > 0 && (
                <div className="px-2 py-1 rounded-sm border border-[#f7a34b]/30 bg-[#f7a34b]/10 text-[#f7a34b] text-xs flex items-center gap-2 min-w-0 shrink-0">
                  <span className="opacity-40 font-semibold shrink-0">WITH:</span>
                  <span className="truncate max-w-[140px]">
                    {room.people
                      .map((person) => person.toUpperCase().replace(/\s+/g, '_'))
                      .join(', ')}
                    {!room.aiPresent && ' · 🧠⬜'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {displayName && (
        <div className="hidden sm:block text-[10px] text-slate-500 font-mono tracking-widest uppercase shrink-0">
          {displayName.toUpperCase().replace(/\s+/g, '_')}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-[#ff5f56]/30 via-[#5ec98f]/30 to-[#b07af5]/30" />
    </header>
  )
}
