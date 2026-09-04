/** Compact dsh-hotkey card for Settings → configurable plugins. */

import type { ReactNode } from 'react'
import { HotkeySettingsSection } from './HotkeySettingsSection.tsx'
import { PluginCardShell } from './plugin-card-shell.tsx'

export function HotkeyPluginCard(): ReactNode {
  return (
    <PluginCardShell
      name="Hotkey"
      available
      dirty={false}
      extraBadge={null}
      onSave={() => {}}
      onDiscard={() => {}}
      footer={null}
    >
      <HotkeySettingsSection />
    </PluginCardShell>
  )
}
