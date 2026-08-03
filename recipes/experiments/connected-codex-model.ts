import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CODEX_MODEL, createCodexModel } from '../../lib/models/codex'

interface CodexAuthDocument {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

export const connectedCodexModelName = CODEX_MODEL

export const getConnectedCodexModel = (
  authPathEnvironmentVariable: string,
): ReturnType<typeof createCodexModel> => {
  const authPath = process.env[authPathEnvironmentVariable]
    ?? join(homedir(), '.codex', 'auth.json')
  const document = JSON.parse(
    readFileSync(authPath, 'utf8'),
  ) as CodexAuthDocument
  const accessToken = document.tokens?.access_token
  const accountId = document.tokens?.account_id
  if (!accessToken || !accountId) throw new Error('codex_auth_unavailable')
  return createCodexModel({ accessToken, accountId })
}
