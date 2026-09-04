/** Accessible DSH-style selector pill and portaled MenuDropdown. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string | boolean> {
  value: T
  label: string
}

export interface SelectMenuProps<T extends string | boolean> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  compact?: boolean
  fullWidth?: boolean
}

interface MenuPosition {
  left: number
  top: number
  maxHeight: number
}

const VIEWPORT_MARGIN = 12
const MENU_GAP = 4
const MENU_MIN_WIDTH = 218

export function SelectMenu<T extends string | boolean>({
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  fullWidth = false,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selectedOption = options[selectedIndex] ?? options[0]

  const close = (restoreFocus = false) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const selectIndex = (index: number) => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    close(true)
  }

  const openMenu = (index = selectedIndex) => {
    if (disabled || options.length === 0) return
    setActiveIndex(index)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      if (trigger === null) return
      const rect = trigger.getBoundingClientRect()
      const menu = menuRef.current
      const width = menu?.offsetWidth ?? MENU_MIN_WIDTH
      const height = menu?.offsetHeight ?? 0
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const maxHeight = Math.max(80, viewportHeight - VIEWPORT_MARGIN * 2)

      const left = Math.min(
        Math.max(rect.right - width, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN),
      )
      const below = rect.bottom + MENU_GAP
      const above = rect.top - height - MENU_GAP
      const top = height > 0 && below + height > viewportHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
        ? above
        : Math.min(
            Math.max(below, VIEWPORT_MARGIN),
            Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN),
          )
      setPosition({ left, top, maxHeight })
    }

    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (rootRef.current?.contains(event.target) === true) return
      if (menuRef.current?.contains(event.target) === true) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key === 'Tab') {
        close()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(index => (index + 1) % options.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(index => (index - 1 + options.length) % options.length)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        setActiveIndex(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        setActiveIndex(options.length - 1)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectIndex(activeIndex)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, activeIndex, options])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const menu = open && createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="选择选项"
      style={{
        boxSizing: 'border-box',
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        width: 'max-content',
        minWidth: `${MENU_MIN_WIDTH}px`,
        maxWidth: 'min(360px, calc(100vw - 24px))',
        maxHeight: `${position?.maxHeight ?? 320}px`,
        overflowY: 'auto',
        padding: '4px',
        border: '1px solid var(--dsw-alias-border-inverted, rgba(255, 255, 255, 0.16))',
        borderRadius: '12px',
        background: 'var(--dsw-specific-menu, #292a2d)',
        boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0, 0, 0, 0.32))',
        color: 'var(--dsw-alias-label-primary, #fff)',
        visibility: position === null ? 'hidden' : 'visible',
        fontFamily: 'inherit',
      }}
      onClick={(event) => { event.stopPropagation() }}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const active = index === activeIndex
        return (
          <button
            key={String(option.value)}
            type="button"
            role="menuitem"
            data-option-index={index}
            aria-current={selected ? 'true' : undefined}
            onMouseEnter={() => { setActiveIndex(index) }}
            onClick={() => { selectIndex(index) }}
            style={{
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              minHeight: '40px',
              padding: '8px 10px',
              border: 'none',
              borderRadius: '10px',
              outline: 'none',
              background: active
                ? 'var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08))'
                : 'transparent',
              color: 'var(--dsw-alias-label-primary, #fff)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 400,
              lineHeight: '22px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {option.label}
            </span>
            {selected && (
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flex: 'none', color: 'var(--dsw-alias-label-primary, #fff)' }}
              >
                <path d="M3.25 8.25 6.5 11.5 12.75 5.25" />
              </svg>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', ...(fullWidth ? { width: '100%' } : {}) }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { open ? close() : openMenu() }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openMenu(selectedIndex)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu(options.length - 1)
          }
        }}
        style={{
          display: 'inline-flex',
          ...(fullWidth ? { width: '100%', justifyContent: 'space-between' } : {}),
          alignItems: 'center',
          gap: compact ? '8px' : '12px',
          height: compact ? '30px' : '36px',
          padding: compact ? '0 8px' : '0 14px',
          border: compact ? '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12))' : 'none',
          borderRadius: compact ? '5px' : '18px',
          outline: 'none',
          background: compact ? 'transparent' : 'var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08))',
          color: disabled
            ? 'var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35))'
            : 'var(--dsw-alias-label-primary, inherit)',
          fontFamily: 'inherit',
          fontSize: compact ? '12px' : '14px',
          fontWeight: 400,
          lineHeight: compact ? '20px' : '22px',
          cursor: disabled ? 'default' : 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={(event) => {
          if (!disabled) event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.12))'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = compact
            ? 'transparent'
            : 'var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08))'
        }}
      >
        <span>{selectedOption?.label}</span>
        <svg
          viewBox="0 0 14 14"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flex: 'none', color: 'var(--dsw-alias-label-caption, currentColor)' }}
        >
          <path d="M3.5 5.25 7 8.75 10.5 5.25" />
        </svg>
      </button>
      {menu}
    </span>
  )
}
