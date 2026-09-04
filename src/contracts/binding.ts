/** Persistence-neutral binding shape consumed by the keyboard core. */
export interface HotkeyBindingRecord {
  readonly id: string
  readonly event: string
  readonly hotkey: string
  readonly enabled: boolean
}
