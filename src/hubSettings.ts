const NAME_KEY = 'satoru_hub_name'
export const DEFAULT_HUB_NAME = 'Satoru HUB'

export function getStoredHubName(): string {
  return localStorage.getItem(NAME_KEY) || DEFAULT_HUB_NAME
}

export function setHubName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    localStorage.removeItem(NAME_KEY)
    return
  }
  localStorage.setItem(NAME_KEY, trimmed)
}
