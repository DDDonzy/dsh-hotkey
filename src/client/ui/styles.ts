/** Shared DSH-token stylesheet for the Hotkey settings editor. */

export const HOTKEY_UI_CSS = `
.dsh-hotkey-control {
  transition: background .16s, border-color .16s, color .16s;
}
.dsh-hotkey-control:hover:not(:disabled),
.dsh-hotkey-control:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: var(--dsw-alias-label-primary) !important;
  border-color: var(--dsw-alias-state-business-primary, #759aff) !important;
}
.dsh-hotkey-control:hover:not(:disabled) svg,
.dsh-hotkey-control:active:not(:disabled) svg {
  color: var(--dsw-alias-state-business-primary, #759aff) !important;
}
.dsh-hotkey-control:focus-visible {
  outline: 1px solid var(--dsw-alias-state-business-primary, #759aff);
  outline-offset: 1px;
}
.dsh-hotkey-disclosure:focus-visible {
  outline: 1px solid var(--dsw-alias-state-business-primary, #759aff);
  outline-offset: 1px;
}
.dsh-hotkey-editor:hover [data-hotkey-clear="true"],
[data-hotkey-clear="true"]:focus-visible {
  opacity: 1 !important;
  pointer-events: auto;
}
[data-hotkey-clear="true"] {
  opacity: 0 !important;
  pointer-events: none;
}
.dsh-hotkey-disclosure-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  transition: color .16s;
}
.dsh-hotkey-control.dsh-hotkey-disclosure-icon:hover,
.dsh-hotkey-control.dsh-hotkey-disclosure-icon:hover svg,
.dsh-hotkey-control.dsh-hotkey-icon:hover:not(:disabled),
.dsh-hotkey-control.dsh-hotkey-icon:hover:not(:disabled) svg,
.dsh-hotkey-control.dsh-hotkey-icon:active:not(:disabled),
.dsh-hotkey-control.dsh-hotkey-icon:active:not(:disabled) svg {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--dsw-alias-state-business-primary, #759aff) !important;
}
.dsh-hotkey-icon {
  transition: color .16s;
}
.dsh-hotkey-menu-item[data-selected="true"],
.dsh-hotkey-menu-item:hover:not(:disabled),
.dsh-hotkey-menu-item:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: var(--dsw-alias-label-primary) !important;
}
.dsh-hotkey-menu-item[data-selected="true"] {
  font-weight: 600;
}
.dsh-hotkey-menu-item:focus-visible {
  outline: 1px solid var(--dsw-alias-state-business-primary, #759aff);
  outline-offset: -1px;
}
`
