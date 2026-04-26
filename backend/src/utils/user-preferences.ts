import { z } from 'zod'

const userPreferencesSchema = z.object({
  theme: z.enum(['dark', 'light']).default('dark'),
})

export type UserPreferences = z.infer<typeof userPreferencesSchema>

export function normalizeUserPreferences(raw: string | Record<string, unknown> | null | undefined): UserPreferences {
  if (!raw) {
    return { theme: 'dark' }
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return userPreferencesSchema.parse(parsed)
  } catch {
    return { theme: 'dark' }
  }
}

export function serializeUserPreferences(raw: string | Record<string, unknown> | null | undefined): string {
  return JSON.stringify(normalizeUserPreferences(raw))
}
