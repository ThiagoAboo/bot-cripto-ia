let internalApiBaseUrl = normalizeBaseUrl(
  process.env.INTERNAL_API_BASE_URL
  || process.env.BOT_RUNTIME_BACKEND_BASE_URL
  || null,
)

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/\/+$/, '')
}

export function setInternalApiBaseUrl(url: string): void {
  internalApiBaseUrl = normalizeBaseUrl(url)
  if (internalApiBaseUrl) {
    process.env.INTERNAL_API_BASE_URL = internalApiBaseUrl
  }
}

export function getInternalApiBaseUrl(): string {
  const resolved = normalizeBaseUrl(
    internalApiBaseUrl
    || process.env.INTERNAL_API_BASE_URL
    || process.env.BOT_RUNTIME_BACKEND_BASE_URL
    || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
  )

  if (!resolved) {
    throw new Error('Não foi possível resolver a URL base interna da API')
  }

  return resolved
}
