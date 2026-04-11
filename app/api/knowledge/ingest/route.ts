// Document ingestion endpoint.
//
// POST /api/knowledge/ingest -- multipart/form-data with a single `file` field.
// Optional `voyageSlug` form field scopes the upload to a voyage (captain-only).
//
// Flow:
//   1. requireAuthResponse
//   2. validate file type + size (10MB cap)
//   3. ensure the knowledge-ingest bucket exists (idempotent bootstrap)
//   4. upload the blob to Supabase Storage
//   5. extract text (PDF / markdown / plain text)
//   6. create a parent `document` source event with sourceRef pointing at the blob
//   7. fire-and-forget processDocument() via waitUntil for comprehension pass
//   8. return { ok, documentId, eventId }
//
// BYO policy: the route itself does not call any LLM. processDocument() resolves
// the user's reasoning key; if none is configured it no-ops with a logged warning
// (never falls back to server ANTHROPIC_API_KEY).
//
// No tier gates. No file-size tier logic. 10MB is a flat launch cap for everyone.

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireAuthResponse } from '@/lib/auth'
import { isCaptain } from '@/lib/voyage'
import { getAdminClient } from '@/lib/supabase/admin'
import { createSourceEvent } from '@/lib/knowledge/events'
import { processDocument } from '@/lib/agents/cartographer'
import { log } from '@/lib/debug'

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB flat cap
const BUCKET = 'knowledge-ingest'

const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
])

const ALLOWED_EXT = new Set<string>(['pdf', 'md', 'markdown', 'txt'])

type NormalizedKind = 'pdf' | 'markdown' | 'text'

const normalizeKind = (mime: string, fileName: string): NormalizedKind | null => {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime === 'text/markdown' || mime === 'text/x-markdown' || ext === 'md' || ext === 'markdown') return 'markdown'
  if (mime === 'text/plain' || ext === 'txt') return 'text'
  // Some browsers send application/octet-stream — fall back to extension.
  if (ALLOWED_EXT.has(ext)) {
    if (ext === 'pdf') return 'pdf'
    if (ext === 'md' || ext === 'markdown') return 'markdown'
    if (ext === 'txt') return 'text'
  }
  return null
}

// -----------------------------------------------------------------------------
// Bucket bootstrap (idempotent)
// -----------------------------------------------------------------------------

let _bucketReady: Promise<boolean> | null = null

const ensureBucket = async (): Promise<boolean> => {
  if (_bucketReady) return _bucketReady
  _bucketReady = (async () => {
    const supabase = getAdminClient()
    try {
      const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
      if (listErr) {
        log.api('ingest: listBuckets failed', { error: listErr.message }, 'warn')
        // If we can't list (e.g. permissions), try createBucket — it will
        // report "already exists" and we can treat that as success.
      } else if (buckets?.some((b) => b.name === BUCKET)) {
        return true
      }
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_FILE_BYTES,
      })
      if (createErr) {
        // Idempotent: ignore "already exists" / 409 conflicts.
        const msg = createErr.message?.toLowerCase() ?? ''
        if (msg.includes('already exists') || msg.includes('duplicate')) return true
        log.api('ingest: createBucket failed', { error: createErr.message }, 'error')
        return false
      }
      return true
    } catch (err) {
      log.api('ingest: ensureBucket threw', { error: String(err) }, 'error')
      return false
    }
  })()
  return _bucketReady
}

// -----------------------------------------------------------------------------
// Text extraction
// -----------------------------------------------------------------------------

const extractText = async (
  bytes: Uint8Array,
  kind: NormalizedKind
): Promise<string> => {
  if (kind === 'text' || kind === 'markdown') {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
  // pdf
  // Dynamic import so pdf-parse / pdfjs only load when we actually need them.
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText: () => Promise<{ text: string }>
    }
  }
  const parser = new mod.PDFParse({ data: bytes })
  const result = await parser.getText()
  return result.text ?? ''
}

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------

export const POST = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  // ---- Parse multipart form ---------------------------------------------------
  let form: FormData
  try {
    form = await req.formData()
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid multipart form body', message: String(err) },
      { status: 400 }
    )
  }

  const file = form.get('file')
  const voyageSlugRaw = form.get('voyageSlug')
  const voyageSlug =
    typeof voyageSlugRaw === 'string' && voyageSlugRaw.trim().length > 0
      ? voyageSlugRaw.trim()
      : undefined

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing `file` field in multipart form' },
      { status: 400 }
    )
  }

  // ---- Size check -------------------------------------------------------------
  if (file.size <= 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: 'File too large',
        message: `Max 10MB. Uploaded ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
      },
      { status: 413 }
    )
  }

  // ---- Type check (MIME + extension fallback) --------------------------------
  const fileName = file.name || 'untitled'
  const mimeType = file.type || 'application/octet-stream'
  const kind = normalizeKind(mimeType, fileName)
  if (!kind) {
    return NextResponse.json(
      {
        error: 'Unsupported file type',
        message: 'Only PDF, Markdown, and plain text are supported at launch.',
      },
      { status: 415 }
    )
  }
  // If the MIME was valid and recognised directly, also accept. Otherwise we
  // already accepted via extension fallback above.
  if (!ALLOWED_MIME.has(mimeType)) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type', message: `mime=${mimeType}` },
        { status: 415 }
      )
    }
  }

  // ---- Captain check for voyage-scoped uploads -------------------------------
  if (voyageSlug) {
    const captain = await isCaptain(voyageSlug, userId)
    if (!captain) {
      return NextResponse.json(
        { error: 'Only the voyage captain can upload documents to a voyage' },
        { status: 403 }
      )
    }
  }

  // ---- Ensure storage bucket exists ------------------------------------------
  const bucketOk = await ensureBucket()
  if (!bucketOk) {
    return NextResponse.json(
      {
        error: 'Storage not available',
        message: `The \`${BUCKET}\` bucket could not be created. Ask the operator to create it manually in Supabase Storage (private bucket, 10MB file limit).`,
      },
      { status: 503 }
    )
  }

  // ---- Read file bytes --------------------------------------------------------
  let bytes: Uint8Array
  try {
    const arrayBuffer = await file.arrayBuffer()
    bytes = new Uint8Array(arrayBuffer)
  } catch (err) {
    log.api('ingest: failed to read file bytes', { error: String(err) }, 'error')
    return NextResponse.json(
      { error: 'Failed to read uploaded file' },
      { status: 500 }
    )
  }

  // ---- Upload to Supabase Storage --------------------------------------------
  const supabase = getAdminClient()
  const documentId = crypto.randomUUID()
  // Namespace by user (or voyage) for easy cleanup and scoping.
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const scopePrefix = voyageSlug ? `voyage/${voyageSlug}` : `user/${userId}`
  const storageKey = `${scopePrefix}/${documentId}-${safeName}`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, bytes, {
      contentType: mimeType,
      upsert: false,
    })
  if (uploadErr) {
    log.api(
      'ingest: storage upload failed',
      { storageKey, error: uploadErr.message },
      'error'
    )
    return NextResponse.json(
      { error: 'Upload failed', message: uploadErr.message },
      { status: 500 }
    )
  }

  // ---- Extract text -----------------------------------------------------------
  let documentText: string
  try {
    documentText = await extractText(bytes, kind)
  } catch (err) {
    log.api(
      'ingest: text extraction failed',
      { fileName, kind, error: String(err) },
      'error'
    )
    // Blob is already uploaded — leave it as the source of truth. Fail the
    // request so the user knows extraction failed.
    return NextResponse.json(
      {
        error: 'Text extraction failed',
        message: `Could not extract text from ${fileName}.`,
      },
      { status: 422 }
    )
  }

  documentText = documentText.trim()
  if (documentText.length === 0) {
    return NextResponse.json(
      {
        error: 'Empty document',
        message: 'No extractable text found in the uploaded file.',
      },
      { status: 422 }
    )
  }

  // ---- Create the parent `document` source event ----------------------------
  const sourceRef = {
    document_id: documentId,
    bucket: BUCKET,
    storage_key: storageKey,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: file.size,
  }

  // The content on the parent event is a short descriptor. The extracted
  // knowledge nodes (created by processDocument) contain the actual learned
  // knowledge and link back via source_ref.document_id.
  const parentContent = `[document] ${fileName} (${kind}, ${(file.size / 1024).toFixed(1)}KB)`

  const eventId = await createSourceEvent({
    eventType: 'document',
    content: parentContent,
    userId,
    voyageSlug,
    metadata: {
      file_name: fileName,
      mime_type: mimeType,
      document_id: documentId,
    },
    sourceType: 'document',
    sourceRef,
    actorType: 'user',
    actorId: userId,
  })

  if (!eventId) {
    return NextResponse.json(
      { error: 'Failed to record document event' },
      { status: 500 }
    )
  }

  // ---- Fire-and-forget comprehension pass ------------------------------------
  waitUntil(
    processDocument({
      documentId,
      documentText,
      sourceRef,
      parentEventId: eventId,
      userId,
      voyageSlug,
      fileName,
      mimeType,
    }).catch((err) => {
      log.agent(
        'processDocument: unhandled error',
        { documentId, error: err instanceof Error ? err.message : String(err) },
        'error'
      )
    })
  )

  return NextResponse.json({
    ok: true,
    documentId,
    eventId,
  })
}
