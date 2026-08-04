'use client';

// Auth context provider
// Provides auth state to client components

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
}

export type MagicLinkResult =
  | { success: true; outcome: 'sent' }
  | {
      success: false;
      outcome: 'transport_unavailable' | 'failed';
      error: string;
    };

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sendMagicLink: (email: string) => Promise<MagicLinkResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
}

export const AuthProvider = ({ children, initialUser = null }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser);

  const supabase = createClient();

  // Transform Supabase user to our AuthUser type
  const toAuthUser = (user: User | null): AuthUser | null => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? '',
    };
  };

  // Refresh auth state
  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(toAuthUser(user));
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      setUser(null);
    }
  }, [supabase]);

  // Track whether this tab originated the sign-in (prevents broadcast loop)
  const isRefreshing = useRef(false);

  // Initial auth check and subscription
  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(toAuthUser(user));
      } catch (error) {
        console.error('[Auth] Init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        console.log('[Auth] State change:', _event);
        setUser(toAuthUser(session?.user ?? null));
        setIsLoading(false);

        // Universal guard: if this event was triggered by a BroadcastChannel refresh, skip all broadcast logic
        if (isRefreshing.current) return;

        // Only broadcast on SIGNED_IN — sign-out is handled locally by each tab via onAuthStateChange
        if (_event === 'SIGNED_IN' && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('voyager-auth');
          channel.postMessage({ type: 'auth_complete' });
          channel.close();
          console.log('[Auth] Broadcasted auth_complete to other tabs');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Listen for auth completion from other tabs (magic link flow)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('voyager-auth');
    channel.onmessage = async (event) => {
      if (event.data?.type === 'auth_complete') {
        console.log('[Auth] Received auth_complete from another tab');
        isRefreshing.current = true;
        await refresh();
        isRefreshing.current = false;
      }
    };

    return () => channel.close();
  }, [refresh]);

  // Send magic link via server API route (Resend delivery)
  const sendMagicLink = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json() as {
        success?: boolean
        outcome?: string
        error?: string
      }

      if (data.outcome === 'transport_unavailable') {
        console.warn('[Auth] Magic link email transport unavailable')
        return {
          success: false as const,
          outcome: 'transport_unavailable' as const,
          error: 'Email delivery is not configured here. Ask the operator to retrieve your magic link from the server logs.',
        }
      }

      if (!res.ok || !data.success || data.outcome !== 'sent') {
        console.error('[Auth] Magic link error:', data.error)
        return {
          success: false as const,
          outcome: 'failed' as const,
          error: data.error ?? 'Failed to send magic link',
        }
      }

      console.log('[Auth] Magic link sent')
      return { success: true as const, outcome: 'sent' as const }
    } catch (error) {
      console.error('[Auth] sendMagicLink error:', error)
      return {
        success: false as const,
        outcome: 'failed' as const,
        error: 'Failed to send magic link',
      }
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      console.log('[Auth] Signed out');
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    }
  }, [supabase]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    sendMagicLink,
    signOut,
    refresh,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
