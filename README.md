# DeepSeek Harness Dynamic Hotkey Plugin (`dsh-hotkey`)

[中文文档](README.zh.md) | English

`dsh-hotkey` adds an extensible **event + hotkey** system to the DeepSeek Harness Web GUI. Keys and behaviors are no longer coupled in a hard-coded switch: users can add, remove, disable, reorder, and recombine bindings, while other browser plugins can register events that automatically appear in the Hotkey settings page.

It is a proper out-of-tree DSH client plugin loaded through the Web module system. It does not modify official DSH sources.

Configuration currently uses DSH's official `settingsScope` and is stored in `$DSH_HOME/settings.yaml`. DSH's settings-file provider is one shared YAML document for all namespaces; the plugin cannot move only `dsh-hotkey` to `$DSH_HOME/hotkey.yaml`. Moving the provider would also move model, theme, and other DSH settings, so it is not done automatically. True per-namespace files require a multi-document provider or a second settings service from DSH.

## Model

```text
KeyboardEvent -> compiled ordered bindings -> Action registry -> invoke() -> handled / continue / defer-native
```

- An **event** has a stable namespaced id, label, description, source, scope, and executor.
- A **hotkey** is a recordable chord such as `Mod+Enter`, `Ctrl+Alt+KeyK`, or `F8`.
- A **binding** is only `event + hotkey + enabled`; it is currently persisted through DSH's official `settingsScope` in `$DSH_HOME/settings.yaml`. DSH's current settings provider is one shared document for all namespaces, so a plugin cannot move only its own namespace to `hotkey.yaml`; that requires a multi-document provider or a second profile-level settings service from DSH.
- Several events may share one hotkey. They run in list order until one returns `true`. This preserves DSH menu arbitration: a menu event runs first, then submission/history/indent runs only when the menu passes.
- Bindings for unloaded third-party events are retained and become active when their provider loads again.

## Native DSH 0.1.2-rc.1 keymap inventory

DSH currently has no central hotkey registry and no global chords for New Session, Settings, sidebar toggling, or session switching. Its native keymap primarily belongs to the focused Lexical composer:

| Native key | Behavior | Condition |
| :--- | :--- | :--- |
| `Enter` | Primary submission | Queue while idle; while busy follows `ui-conversation.busyEnter` (default: queue) |
| `Ctrl+Enter` / `Cmd+Enter` | Alternate submission | Opposite busy mode; with an empty draft and queued rows, can steer the complete queue |
| `Shift+Enter` | Insert newline | Checked before accelerated submission |
| `ArrowUp` / `ArrowDown` | Previous/next trigger candidate | Only while a `/` or `@` menu is open |
| `Enter` | Accept highlighted candidate | Falls through to submission without a highlighted candidate |
| `Escape` | Dismiss composer popup/menu | Passes when no composer menu is open |
| `Tab` | Drill into a directory candidate | Passes when the highlighted candidate is not drillable |
| `Space` | Adjudicate a completed leading token | Consumed only when a trigger source accepts it |

Other Enter/Escape/arrow behaviors are local accessibility controls owned by their focused dialog, tree, editor, or popover. They are intentionally not imported as global remappable bindings.

## Built-in event catalog

### DSH events

| Event id | Action | Default binding |
| :--- | :--- | :--- |
| `dsh.composer.menu.previous` | Previous trigger candidate | `ArrowUp` first |
| `dsh.composer.menu.next` | Next trigger candidate | `ArrowDown` first |
| `dsh.composer.menu.accept` | Accept highlighted candidate | Enter-family chords first |
| `dsh.composer.menu.drill` | Drill into directory candidate | `Tab` first |
| `dsh.composer.menu.dismiss` | Dismiss composer popup/menu | `Escape` first |
| `dsh.composer.complete-with-space` | Complete leading token with Space | `Space` |
| `dsh.composer.submit.primary` | DSH primary submission policy | `Enter` / `Alt+Enter` and Numpad equivalents |
| `dsh.composer.submit.alternate` | DSH alternate submission policy | `Mod+Enter` / `Mod+Alt+Enter` and Numpad equivalents |
| `dsh.composer.submit.queue` | Explicit queue submission | Unbound |
| `dsh.composer.submit.steer` | Explicit steer submission | Unbound |
| `dsh.composer.insert-newline` | Insert a Lexical line break | `Shift+Any+Enter` / `Shift+Any+NumpadEnter` (Shift takes priority) |
| `dsh.session.cancel` | Stop the current run | `Escape`, after menu dismissal |
| `dsh.session.start-new` | Start a new Session | Unbound |
| `dsh.layout.toggle-sidebar` | Toggle sidebar | Unbound |
| `dsh.layout.open-details` | Open details panel | Unbound |
| `dsh.layout.close-details` | Close details panel | Unbound |
| `dsh.connection.reconnect` | Reconnect to Host | Unbound |
| `dsh.composer.focus` | Focus current composer | Unbound |

`Mod` is the portable primary modifier and matches Ctrl or Cmd/Meta. Chords reserved by the OS or browser (for example some address-bar or window-close shortcuts) may never reach the page and cannot be overridden by the plugin.

### Plugin extension events

| Event id | Action | Default binding |
| :--- | :--- | :--- |
| `dsh-hotkey.history.previous` | Previous user input | `ArrowUp`, after menu pass |
| `dsh-hotkey.history.next` | Next input / restore draft | `ArrowDown`, after menu pass |
| `dsh-hotkey.cursor.page-up` | Move caret up ten visual lines | `PageUp`; `Shift+PageUp` extends selection |
| `dsh-hotkey.cursor.page-down` | Move caret down ten visual lines | `PageDown`; `Shift+PageDown` extends selection |
| `dsh-hotkey.editor.insert-indent` | Insert four spaces | `Tab`, after menu pass |
| `dsh-hotkey.editor.insert-tab` | Insert a tab character | Unbound |

## Settings UI and persistence

Open **Settings → Hotkey** or **Settings → Configurable plugins → Hotkey**. Each row supports event selection, chord recording/clearing, enable/disable, ordering, and deletion. Same-key rows show their fallback-chain position. A reset button restores the complete DSH + plugin default chain.

The v2 YAML shape is:

```yaml
dsh-hotkey:
  schemaVersion: 3
  bindings:
    - id: dsh-menu-accept-enter
      event: dsh.composer.menu.accept
      hotkey: Enter
      enabled: true
    - id: dsh-enter-primary
      event: dsh.composer.submit.primary
      hotkey: Enter
      enabled: true
```

When a legacy `dsh-hotkey` section contains any Esc, Enter-behavior, page-cursor, history, or Tab field, it is converted to bindings while retaining old Numpad/Ctrl/Shift priority and modifier handling. Enter actions map directly to DSH's standard Queue, Steer, and Newline events; the old plugin-only compatibility events are removed. `Any` in a migrated row means extra modifiers are allowed; newly recorded bindings remain exact by default. Once `bindings` is saved, it is authoritative and legacy fields left in YAML are ignored. An installation with no persisted legacy section cannot be distinguished from an old installation whose defaults were never written, so it receives the new native-DSH default chain.

## Registering an Action from another plugin

Both dependency declarations are required: package metadata must contain
`dsh.client.inject: ['dsh-hotkey']` for the client module graph, while the
browser entry declares `inject = ['hotkeyRegistry']` for the Cordis service.

```ts
import type { HotkeyRegistryV1 } from 'dsh-hotkey/client'

export const inject = ['hotkeyRegistry'] as const

export function apply(ctx: { get?: (id: string) => unknown }): () => void {
  const registry = ctx.get?.('hotkeyRegistry') as HotkeyRegistryV1
  return registry.registerAction({
    id: 'my-plugin.toggle-panel',
    label: 'Toggle my panel',
    description: 'Show or hide the my-plugin panel.',
    category: 'my-plugin',
    scope: 'global',
    invoke() {
      toggleMyPanel()
      return 'handled'
    },
  })
}
```

`HotkeyRegistryV1` exposes `apiVersion === 1` and the `actions` /
`dispatch-outcome-v1` capability flags. Action IDs must be unique lowercase
namespaced identifiers. `invoke()` decides synchronously whether to return `handled`, `continue`, or `defer-native`; it
may start asynchronous work but cannot await before returning. Disposing a
registration removes it from the live catalog without deleting the user's
stored binding. Legacy `register({ execute() })` remains temporarily supported.

## Architecture

- `src/settings.ts` — binding contract, event ids, defaults, and v1 migration.
- `src/index.ts` — Host settings namespace/schema.
- `src/client/events.ts` — live event registry and plugin API.
- `src/client/hotkey.ts` — chord parsing, capture, normalization, and matching.
- `src/client/interceptor.ts` — ordered dispatcher and built-in executors.
- `src/client/store.ts` — stable reactive state, Host persistence metadata, and write errors.
- `src/client/HotkeySettingsSection.tsx` — dynamic binding editor.
- `src/client/history.ts`, `history-source.ts` — input history and reference/image restoration.
- `src/client/dom.ts` — composer DOM/selection compatibility layer.

The browser bundle still uses `window.__ModuleLoader__.load({ id, factory })`. DSH 0.1.2 does not expose a public keyboard-action face, so menu arbitration, Space adjudication, and `steerQueue` use a compatibility bridge to the current concrete input shell. If those private capabilities disappear, the dispatcher fails open and lets DSH's native keymap handle the original event. Build output now goes to `dist/`; stale `lib/` artifacts are no longer package entries.

## Development

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Outputs are `dist/index.js`, `dist/index.d.ts`, `dist/client.js`, `dist/client.js.map`, and source-derived browser declarations under `dist/types/`. `prepare` builds them automatically for Git installs and publication.

Install into a profile with:

```bash
dsh plugin --profile web add <path-to-this-checkout>
```

After adding the plugin row, launch a new Web process to load it. During development, keep an existing service untouched and validate on another port:

```bash
dsh web --port 3093 --no-open
```

## License

MIT
