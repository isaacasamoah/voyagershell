// DocumentUploadAdapter - Inline file upload for knowledge ingestion
// Accepts .pdf, .md, .txt files up to 10MB
// POSTs multipart/form-data to /api/knowledge/ingest
// Active state: drop zone + file picker
// Resolved state: "Uploaded filename — processing."

'use client'

import { useState, useCallback, useRef } from 'react'
import { Card, Stack, Text, Button } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

interface DocumentUploadAdapterProps {
  voyageSlug?: string
  message?: string
  __state?: ComponentState
  __resolution?: ComponentResolution
  onAction?: (action: string, data?: unknown) => void
  onSendMessage?: (text: string) => void
}

export const DocumentUploadAdapter = ({
  voyageSlug,
  message,
  __state = 'active',
  __resolution,
  onAction,
  onSendMessage,
}: DocumentUploadAdapterProps) => {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE_BYTES) {
      const msg = `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.`
      setError(msg)
      onSendMessage?.(`Upload failed: ${msg}`)
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (voyageSlug) {
        formData.append('voyageSlug', voyageSlug)
      }

      const res = await fetch('/api/knowledge/ingest', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.text()
        let errorMessage: string
        try {
          const parsed = JSON.parse(body)
          errorMessage = parsed.error ?? parsed.message ?? `Upload failed (${res.status})`
        } catch {
          errorMessage = `Upload failed (${res.status})`
        }
        setError(errorMessage)
        setUploading(false)
        onSendMessage?.(`Upload failed: ${errorMessage}`)
        return
      }

      // Success
      setUploading(false)
      onAction?.('document_uploaded', { fileName: file.name })
      onSendMessage?.(`Uploaded ${file.name} (${Math.round(file.size / 1024)}KB), cartographer processing started.`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      setError(errorMessage)
      setUploading(false)
      onSendMessage?.(`Upload failed: ${errorMessage}`)
    }
  }, [voyageSlug, onAction, onSendMessage])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }, [uploadFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }, [uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  // Resolved state
  if (__state === 'resolved' && __resolution) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500">✓</span>
        <Text variant="body">{__resolution.label}</Text>
      </div>
    )
  }

  // Dismissed state
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Upload dismissed]
      </Text>
    )
  }

  // Active state — drop zone + file picker
  return (
    <Card variant="outlined" className="border-indigo-500/30 bg-indigo-500/5">
      <Stack gap="sm">
        {message && (
          <Text variant="caption" className="text-slate-400">{message}</Text>
        )}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            flex flex-col items-center justify-center gap-2 p-6
            border-2 border-dashed rounded-sm transition-colors cursor-pointer
            ${dragOver
              ? 'border-indigo-400/60 bg-indigo-500/10'
              : 'border-white/15 hover:border-white/25 bg-black/20'
            }
          `}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        >
          <Text variant="caption" className="text-slate-400">
            Drop a file here or click to choose
          </Text>
          <Text variant="caption" className="text-slate-600 text-xs">
            PDF, Markdown, or Text — up to 10MB
          </Text>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="md"
            loading={uploading}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading...' : 'Choose file'}
          </Button>
        </div>
        {error && (
          <Text variant="caption" className="text-red-400">{error}</Text>
        )}
      </Stack>
    </Card>
  )
}
