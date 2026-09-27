// localStorage can be unavailable (private windows, blocked site data), so every access is guarded.

export function load<T>(key: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Settings just won't be remembered.
  }
}
