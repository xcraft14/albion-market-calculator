// The foundry data is only loaded when the Artifact Foundry page opens.

import type { FoundryData } from './types'

let loading: Promise<FoundryData> | null = null

export function loadFoundryData(): Promise<FoundryData> {
  loading ??= import('./foundry.json').then((m) => m.default as unknown as FoundryData)
  return loading
}
