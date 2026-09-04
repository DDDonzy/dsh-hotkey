/** Chord capture control with a non-layout-shifting clear overlay. */

import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatHotkey, hotkeyFromKeyboardEvent } from '../hotkey.ts'

export function HotkeyRecorder({
  value,
  disabled,
  onChange,
  onClear,
}: {
  readonly value: string
  readonly disabled: boolean
  readonly onChange: (hotkey: string) => void
  readonly onClear?: () => void
}): ReactNode {
  const [recording, setRecording] = useState(false)
  const capture = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    const hotkey = hotkeyFromKeyboardEvent(event.nativeEvent)
    if (hotkey === null) return
    onChange(hotkey)
    setRecording(false)
  }

  return (
    <span className="dsh-hotkey-editor" style={{ position: 'relative', display: 'block', width: '100%' }}>
      <button
        type="button"
        data-hotkey-recorder={recording ? 'true' : undefined}
        disabled={disabled}
        aria-label={recording ? '请按下新的快捷键' : `修改快捷键：${formatHotkey(value)}`}
        className="dsh-hotkey-control"
        onClick={() => { setRecording(current => !current) }}
        onBlur={() => { setRecording(false) }}
        onKeyDown={capture}
        style={{
          boxSizing: 'border-box', width: '100%', minHeight: '30px', padding: '4px 8px',
          border: recording ? '1px solid var(--dsw-alias-border-primary, rgba(117,154,255,.9))' : '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))',
          borderRadius: '5px', background: recording ? 'var(--dsw-alias-bg-selected, rgba(91,126,255,.18))' : 'transparent',
          color: recording ? 'var(--dsw-alias-state-business-primary, #759aff)' : 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))',
          font: 'inherit', fontSize: '12px', lineHeight: '20px', textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        }}
      >
        {recording ? 'Press hotkey…' : formatHotkey(value)}
      </button>
      {value === '' || onClear === undefined ? null : (
        <button
          type="button" aria-label="清空快捷键" data-hotkey-clear="true" disabled={disabled}
          className="dsh-hotkey-control dsh-hotkey-icon"
          onMouseDown={event => { event.preventDefault() }}
          onClick={event => { event.stopPropagation(); onClear() }}
          style={{
            position: 'absolute', top: '50%', right: '3px', display: 'inline-flex', width: '24px', height: '24px',
            alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '4px', padding: 0,
            background: 'transparent', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,.48))',
            cursor: disabled ? 'default' : 'pointer', transform: 'translateY(-50%)',
          }}
        >
          <IconCloseOutline16 size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
