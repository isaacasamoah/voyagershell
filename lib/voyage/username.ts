const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,30}$/
const RESERVED: readonly string[] = ['voyager', 'system', 'everyone', 'all', 'me']

export type NormalizeUsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: string }

export const normalizeUsername = (raw: string): NormalizeUsernameResult => {
  const username = raw.trim().toLowerCase()

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: 'Usernames must be 2–31 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.',
    }
  }

  if (RESERVED.includes(username)) {
    return { ok: false, error: `The username "${username}" is reserved — try another.` }
  }

  return { ok: true, username }
}
