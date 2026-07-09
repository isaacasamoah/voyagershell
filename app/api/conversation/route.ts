// Conversation management API
// GET - Get active conversation with messages (auto-continue)
// POST - Create new conversation (for /new command)

import { NextResponse } from 'next/server'
import {
  getOrCreateActiveConversation,
  archiveConversation,
} from '@/lib/conversation'
import { requireAuthResponse } from '@/lib/auth'
import { getRoom } from '@/lib/messaging/room'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/conversation
 * Get the active conversation with messages.
 * Creates a new one if none exists (auto-continue behavior).
 * Optional query param: voyageSlug - scope to a specific voyage
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const voyageSlug = url.searchParams.get('voyageSlug') ?? undefined

  console.log('[Conversation API] GET - Fetching active conversation, voyage:', voyageSlug ?? 'personal')

  try {
    // Require authentication
    const authResult = await requireAuthResponse()
    if (authResult instanceof Response) return authResult
    const userId = authResult
    console.log('[Conversation API] User ID:', userId)

    const conversation = await getOrCreateActiveConversation(userId, { voyageSlug })

    if (!conversation) {
      console.error('[Conversation API] Failed to get/create conversation')
      return NextResponse.json(
        { error: 'Failed to get conversation' },
        { status: 500 }
      )
    }

    console.log(
      '[Conversation API] Returning conversation:',
      conversation.id,
      'with',
      conversation.messages.length,
      'messages'
    )

    // Room state for the header indicator (who's in the room + is Voyager present)
    const roomState = await getRoom(conversation.id)
    let roomPeopleNames: string[] = []
    if (roomState.roomPeople.length > 0) {
      const admin = getAdminClient()
      const { data: profs } = await (admin as unknown as { from: (t: string) => any })
        .from('profiles').select('id, display_name').in('id', roomState.roomPeople)
      const byId = new Map(((profs as Array<{ id: string; display_name: string | null }>) ?? []).map(p => [p.id, p.display_name]))
      roomPeopleNames = roomState.roomPeople.map(id => byId.get(id) ?? 'someone')
    }

    return NextResponse.json({
      room: { people: roomPeopleNames, aiPresent: roomState.aiPresent },
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        messageCount: conversation.messageCount,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
      },
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[Conversation API] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/conversation
 * Create a new conversation.
 * Archives the current active conversation first.
 * Used by /new command in the UI.
 * Optional body param: voyageSlug - scope to a specific voyage
 */
export const POST = async (req: Request) => {
  console.log('[Conversation API] POST - Creating new conversation')

  try {
    // Require authentication
    const authResult = await requireAuthResponse()
    if (authResult instanceof Response) return authResult
    const userId = authResult

    // Parse body for voyageSlug (optional)
    let voyageSlug: string | undefined
    try {
      const body = await req.json()
      voyageSlug = body.voyageSlug
    } catch {
      // No body or invalid JSON - that's fine
    }

    console.log('[Conversation API] Creating new conversation, voyage:', voyageSlug ?? 'personal')

    // First, get current active conversation to archive it
    const currentConversation = await getOrCreateActiveConversation(userId, { voyageSlug })

    if (currentConversation && currentConversation.messageCount > 0) {
      // Archive the current conversation if it has messages
      console.log(
        '[Conversation API] Archiving current conversation:',
        currentConversation.id
      )
      const archived = await archiveConversation(currentConversation.id)

      if (!archived) {
        console.error('[Conversation API] Failed to archive current conversation')
        return NextResponse.json(
          { error: 'Failed to archive current conversation' },
          { status: 500 }
        )
      }
    }

    // Now get/create a new active conversation
    // Since we archived the previous one, this will create a fresh one
    const newConversation = await getOrCreateActiveConversation(userId, { voyageSlug })

    if (!newConversation) {
      console.error('[Conversation API] Failed to create new conversation')
      return NextResponse.json(
        { error: 'Failed to create new conversation' },
        { status: 500 }
      )
    }

    console.log('[Conversation API] Created new conversation:', newConversation.id)

    return NextResponse.json({
      conversation: {
        id: newConversation.id,
        title: newConversation.title,
        status: newConversation.status,
        messageCount: newConversation.messageCount,
        lastMessageAt: newConversation.lastMessageAt.toISOString(),
        createdAt: newConversation.createdAt.toISOString(),
      },
      messages: [],
    })
  } catch (error) {
    console.error('[Conversation API] POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
