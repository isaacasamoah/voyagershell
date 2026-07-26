'use client'

import type { FormEvent } from 'react'
import type { ComposerAudience } from '@/lib/messaging/address'
import type { Suggestion } from '@/lib/ui/suggestions'
import { InputArea } from './InputArea'

interface VoyagerComposerProps {
  isAuthenticated: boolean
  hasBrain: boolean | null
  suggestions: Suggestion[]
  welcomeHint: string | null
  messageCount: number
  composerAudience: ComposerAudience
  composerAsideCue: string | null
  inputValue: string
  isLoading: boolean
  queueCount: number
  onInputChange: (value: string) => void
  onSuggestion: (action: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export const VoyagerComposer = ({
  isAuthenticated,
  hasBrain,
  suggestions,
  welcomeHint,
  messageCount,
  composerAudience,
  composerAsideCue,
  inputValue,
  isLoading,
  queueCount,
  onInputChange,
  onSuggestion,
  onSubmit,
}: VoyagerComposerProps) => (
  <footer className="flex-none bg-[#050505] border-t border-white/10 p-4 pb-6">
    <div className="max-w-2xl mx-auto">
      {isAuthenticated && hasBrain === false && (
        <div className="mb-3 text-xs text-slate-500">
          no brain connected —{' '}
          <a
            href="/connect"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
          >
            connect your ChatGPT subscription
          </a>{' '}
          to start chatting
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="flex gap-3 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSuggestion(suggestion.action)}
              className="text-xs text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap rounded-sm border border-white/10 hover:border-[#b07af5]/40 bg-white/[0.025] px-2 py-1"
            >
              {suggestion.text}
            </button>
          ))}
        </div>
      )}
      {welcomeHint && messageCount === 0 && (
        <div className="text-xs text-slate-600 mb-3 italic">
          {welcomeHint}
        </div>
      )}
      <div
        data-testid="composer-audience"
        className={`text-xs font-mono mb-1 pl-8 ${
          composerAudience.kind === 'private'
            ? 'text-[#5ec98f]'
            : composerAudience.kind === 'held'
              ? 'text-[#ff8b84]'
              : 'text-[#59a5ff]'
        }`}
      >
        {composerAsideCue ?? composerAudience.label}
      </div>
      <form onSubmit={onSubmit}>
        <InputArea
          value={inputValue}
          onChange={onInputChange}
          onSubmit={() => {
            const form = document.querySelector('form')
            if (form) form.requestSubmit()
          }}
          isLoading={isLoading}
          queueCount={queueCount}
        />
      </form>
    </div>
  </footer>
)
