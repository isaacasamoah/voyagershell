"use client";

import { useState } from 'react';

type Provider = 'anthropic' | 'openai';
type Status = 'idle' | 'saving' | 'saved' | 'error';

export function ApiKeyForm() {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setStatus('saving');
    setError(null);
    const res = await fetch('/api/settings/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, provider }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus('error');
      setError(data.error ?? 'Save failed');
      return;
    }
    setStatus('saved');
    setMaskedKey(data.maskedKey);
    setKey('');
  };

  const clear = async () => {
    await fetch('/api/settings/api-key', { method: 'DELETE' });
    setStatus('idle');
    setMaskedKey(null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">BYO API Key</h3>
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as Provider)}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
      </select>
      {maskedKey ? (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span>Key saved: {maskedKey}</span>
          <button onClick={clear} className="underline text-red-500">
            Clear
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <button
            onClick={save}
            disabled={!key || status === 'saving'}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
