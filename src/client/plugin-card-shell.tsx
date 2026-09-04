/**
 * PluginCardShell —— 复刻官方「可配置插件」页 PluginCard 的结构与视觉：
 *
 *  - 折叠式头部（默认收起）：名称 + 描述 + chevron（展开旋转 180°），
 *    有未保存编辑时显示 "unsaved" 徽标；
 *  - 展开后 body + footer（Discard / Save，Save 仅 dirty 且非 saving 时可点）；
 *  - 全部样式使用 DSH 设计 token（--dsw-alias-*），与官方卡片逐项一致
 *    （数值取自 @deepseek-ai/dsh-client-ui-settings-plugins 的 PluginCard.module.css）。
 */

import { useState, type ReactNode } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'

export interface PluginCardShellProps {
  name: string
  description?: string
  available: boolean
  writable?: boolean
  dirty: boolean
  saving?: boolean
  failed?: string | null
  extraBadge?: string | null
  onSave: () => void
  onDiscard: () => void
  /** 覆盖 footer（传 null 表示无 footer）；默认 Save/Discard */
  footer?: ReactNode | null
  children: ReactNode
}

/**
 * 与官方 PluginCard.module.css 等价的样式（token 引用 + 值保持一致）。
 * open 态通过条件样式切换（官方用 `.cardOpen` 类）。
 */
const css = {
  card: (open: boolean): Record<string, unknown> => ({
    border: '1px solid var(--dsw-alias-border-l2)',
    background: open ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-3)',
    borderRadius: 12,
    listStyle: 'none',
    transition: 'border-color .16s, background .16s',
  }),
  header: {
    appearance: 'none',
    width: '100%',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    background: '0 0',
    border: 0,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    display: 'flex',
  } as const,
  headText: {
    flexDirection: 'column',
    flex: 1,
    gap: 4,
    minWidth: 0,
    display: 'flex',
  } as const,
  name: {
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.4,
  } as const,
  description: {
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 13,
    lineHeight: 1.5,
  } as const,
  chevron: (open: boolean): Record<string, unknown> => ({
    color: 'var(--dsw-alias-label-tertiary)',
    flex: 'none',
    transition: 'transform .16s',
    transform: open ? 'rotate(180deg)' : 'none',
  }),
  badge: {
    whiteSpace: 'nowrap',
    background: 'var(--dsw-alias-bg-module-platform)',
    color: 'var(--dsw-alias-label-secondary)',
    borderRadius: 999,
    flex: 'none',
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '17px',
  } as const,
  body: {
    borderTop: '1px solid var(--dsw-alias-border-l2)',
    margin: '0 16px',
    paddingBottom: 8,
  } as const,
  readOnly: {
    color: 'var(--dsw-alias-label-tertiary)',
    margin: '12px 0 0',
    fontSize: 12,
    lineHeight: 1.5,
  } as const,
  footer: {
    borderTop: '1px solid var(--dsw-alias-border-l2)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    padding: '12px 0 4px',
    display: 'flex',
  } as const,
  failed: {
    minWidth: 0,
    color: 'var(--dsw-alias-label-error)',
    flex: 1,
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
  } as const,
  button: {
    appearance: 'none',
    font: 'inherit',
    cursor: 'pointer',
    border: '1px solid transparent',
    borderRadius: 8,
    padding: '5px 14px',
    fontSize: 13,
    lineHeight: 1.5,
  } as const,
  discard: {
    borderColor: 'var(--dsw-alias-border-l2)',
    color: 'var(--dsw-alias-label-secondary)',
    background: '0 0',
  } as const,
  save: {
    background: 'var(--dsw-alias-label-primary)',
    color: 'var(--dsw-alias-bg-layer-3)',
  } as const,
}

export function PluginCardShell(props: PluginCardShellProps): ReactNode | null {
  const [open, setOpen] = useState(false)
  const { available, dirty, saving = false, failed, writable = true } = props

  if (!available) return null

  const blocked = !dirty || saving

  return (
    <li style={css.card(open) as never}>
      <button
        type="button"
        style={css.header as never}
        aria-expanded={open}
        aria-label={`${open ? '收起' : '展开'}: ${props.name}`}
        onClick={() => setOpen(!open)}
      >
        <span style={css.headText as never}>
          <span style={css.name as never}>{props.name}</span>
          {props.description === undefined || props.description === ''
            ? null
            : <span style={css.description as never}>{props.description}</span>}
        </span>
        {props.extraBadge !== null && props.extraBadge !== undefined
          ? <span style={css.badge as never}>{props.extraBadge}</span>
          : null}
        <IconChevronDownOutline14 size={14} style={css.chevron(open) as never} />
      </button>
      {open ? (
        <div style={css.body as never}>
          {!writable ? <p style={css.readOnly as never}>当前部署不可写（只读）</p> : null}
          {props.children}
          {props.footer !== null
            ? (props.footer !== undefined
                ? <div style={css.footer as never}>{props.footer}</div>
                : (
                    <div style={css.footer as never}>
                      {failed !== null && failed !== undefined
                        ? <p role="status" style={css.failed as never}>{failed}</p>
                        : null}
                      <button
                        type="button"
                        style={{ ...css.button, ...css.discard } as never}
                        disabled={!dirty || saving}
                        onClick={props.onDiscard}
                      >
                        放弃更改
                      </button>
                      <button
                        type="button"
                        style={{ ...css.button, ...css.save } as never}
                        disabled={blocked}
                        onClick={props.onSave}
                      >
                        {saving ? '保存中…' : '保存'}
                      </button>
                    </div>
                  ))
            : null}
        </div>
      ) : null}
    </li>
  )
}
