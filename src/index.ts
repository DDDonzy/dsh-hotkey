/** dsh-hotkey host half: registers the shared settings.yaml namespace. */

import z from '@deepseek-ai/schemastery'
import {
  ENTER_KEY_ACTIONS,
  HOTKEY_SETTINGS_NAMESPACE,
  TAB_KEY_ACTIONS,
} from './settings.ts'

interface SettingsRegistry {
  register<T>(namespace: string, schema: z<T>): unknown
}

interface HostContext {
  inject(dependencies: readonly string[], callback: (ctx: { settings: SettingsRegistry }) => void): void
}

const HotkeyBindingSchema = z.object({
  id: z.string(),
  event: z.string(),
  hotkey: z.string(),
  enabled: z.boolean().default(true),
})

/**
 * Wire-safe schema: optional v1 fields remain visible so the browser decoder
 * can migrate them. Avoid Schemastery transforms here—the callback source is
 * serialized to Web clients and therefore cannot close over local helpers.
 */
const LegacyPresetFilesSchema = z.object({
  'file-a': z.array(HotkeyBindingSchema).default(undefined as never),
  'file-b': z.array(HotkeyBindingSchema).default(undefined as never),
  'file-c': z.array(HotkeyBindingSchema).default(undefined as never),
})

const HotkeyUserPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  bindings: z.array(HotkeyBindingSchema),
})

const HotkeySettingsSchema = z.object({
  // Browser normalization upgrades older layouts to schemaVersion 3.
  schemaVersion: z.number().required(false),
  // Schemastery treats a bare array as [], so an explicit undefined default is
  // required to distinguish a missing v2 field from an intentionally empty keymap.
  activePreset: z.string().required(false),
  bindings: z.array(HotkeyBindingSchema).default(undefined as never),
  presets: z.array(HotkeyUserPresetSchema).default(undefined as never),
  // Accepted only so older persisted A/B/C slots can be migrated browser-side.
  presetFiles: LegacyPresetFilesSchema.required(false),
  escStop: z.boolean().required(false),
  enterBehavior: z.union([...ENTER_KEY_ACTIONS]).required(false),
  ctrlEnterBehavior: z.union([...ENTER_KEY_ACTIONS]).required(false),
  shiftEnterBehavior: z.union([...ENTER_KEY_ACTIONS]).required(false),
  numpadEnterBehavior: z.union([...ENTER_KEY_ACTIONS]).required(false),
  pageUpDownMoveCursor: z.boolean().required(false),
  arrowHistory: z.boolean().required(false),
  tabBehavior: z.union([...TAB_KEY_ACTIONS]).required(false),
})

/** Register the durable `dsh-hotkey` section when the Host settings service exists. */
export function apply(ctx: HostContext): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(HOTKEY_SETTINGS_NAMESPACE, HotkeySettingsSchema)
  })
}
