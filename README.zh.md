# DeepSeek Harness 动态快捷键插件 (`dsh-hotkey`)

中文文档 | [English](README.md)

`dsh-hotkey` 为 DeepSeek Harness Web GUI 提供一个可扩展的 **事件 + Hotkey** 系统：快捷键不再和行为写死在同一段判断中，用户可以新增、删除、停用、排序并重新组合任意绑定；其他浏览器插件也可以注册自己的事件，自动出现在 Hotkey 设置页中。

这是一个真正的 DSH 客户端插件，由 Web 模块系统加载，不修改官方 DSH 源码。

当前配置仍通过 DSH 官方 `settingsScope` 写入 `$DSH_HOME/settings.yaml`。DSH 的 settings-file provider 是所有 namespace 共用的单一 YAML 文档，插件自身不能只把 `dsh-hotkey` 分节移动到 `$DSH_HOME/hotkey.yaml`；将 provider 整体改到另一个文件会同时移动模型、主题等所有 DSH 设置，因而不会被插件自动执行。需要 DSH 提供多文档 provider 或第二 settings service 才能实现真正的单独文件。

## 核心模型

```text
KeyboardEvent -> 预编译有序 bindings -> Action registry -> invoke() -> handled / continue / defer-native
```

- **事件**有稳定的命名空间 id、名称、说明、来源和作用域。
- **Hotkey** 是用户可录制的组合键，例如 `Mod+Enter`、`Ctrl+Alt+KeyK`、`F8`。
- **绑定**只是 `event + hotkey + enabled`；当前通过 DSH 官方 `settingsScope` 持久化在 `$DSH_HOME/settings.yaml`。DSH 现行设置服务是所有 namespace 共用的单一文档，插件不能只把自己的 namespace 单独移动到 `hotkey.yaml`；需要 DSH 提供多文档 settings provider 或 profile 级第二 settings service 才能做到完全隔离。
- 同一个 hotkey 可以绑定多个事件。系统按列表顺序执行；事件返回 `false` 时继续下一行，首个返回 `true` 的事件消费按键。这让 DSH 候选菜单可以优先处理 Enter/Tab/方向键，菜单未命中时再执行发送、历史或缩进。
- 尚未加载的第三方事件不会被删除；其绑定会保留，并在提供该事件的插件加载后自动生效。

## DSH 0.1.2-rc.1 原生快捷键盘点

DSH 当前没有中央 hotkey registry，也没有“新建会话 / 打开设置 / 切换侧边栏”之类的全局组合键。原生键盘逻辑主要位于当前会话的 Lexical composer：

| DSH 原生按键 | 事件语义 | 条件 |
| :--- | :--- | :--- |
| `Enter` | 主提交行为 | 空闲时 queue；繁忙时遵循 `ui-conversation.busyEnter`（默认 queue） |
| `Ctrl+Enter` / `Cmd+Enter` | 备用提交行为 | 繁忙时使用主行为的相反模式；空草稿且有 queued 项时可把全部队列 steer 进当前 turn |
| `Shift+Enter` | 插入换行 | 优先于 Ctrl/Cmd 提交判断 |
| `ArrowUp` / `ArrowDown` | 候选菜单上一项 / 下一项 | `/` 或 `@` 候选菜单打开时；否则放行 |
| `Enter` | 接受高亮候选 | 候选菜单有高亮项时；否则继续提交 |
| `Escape` | 关闭输入候选菜单 | 菜单未打开时放行 |
| `Tab` | 下钻目录候选 | 当前高亮项声明 `drill` 时；否则放行 |
| `Space` | 行首 token 裁决 | `/command` 等 source 成功处理时才消费 |

其他 Enter、Escape、方向键行为分散在各自有焦点的弹层、树、编辑框和对话框内，属于组件可访问性行为，不作为全局可重映射快捷键导入，避免破坏局部控件语义。

## 内置事件目录

### DSH 事件

| 事件 id | 名称 | 默认绑定 |
| :--- | :--- | :--- |
| `dsh.composer.menu.previous` | 候选菜单上一项 | `ArrowUp`（链首） |
| `dsh.composer.menu.next` | 候选菜单下一项 | `ArrowDown`（链首） |
| `dsh.composer.menu.accept` | 接受高亮候选 | `Enter` / `NumpadEnter` / `Mod+Enter` / `Mod+NumpadEnter`（链首） |
| `dsh.composer.menu.drill` | 下钻目录候选 | `Tab`（链首） |
| `dsh.composer.menu.dismiss` | 关闭输入候选菜单 | `Escape`（链首） |
| `dsh.composer.complete-with-space` | 空格确认命令 | `Space` |
| `dsh.composer.submit.primary` | DSH 主提交行为 | `Enter` / `Alt+Enter` 及 Numpad 对应键 |
| `dsh.composer.submit.alternate` | DSH 备用提交行为 | `Mod+Enter` / `Mod+Alt+Enter` 及 Numpad 对应键 |
| `dsh.composer.submit.queue` | 显式排队发送 | 无 |
| `dsh.composer.submit.steer` | 显式插话发送 | 无 |
| `dsh.composer.insert-newline` | 插入换行 | `Shift+Any+Enter` / `Shift+Any+NumpadEnter`（Shift 优先） |
| `dsh.session.cancel` | 停止当前生成 | `Escape`（候选菜单未处理后） |
| `dsh.session.start-new` | 新建会话 | 无 |
| `dsh.layout.toggle-sidebar` | 切换侧边栏 | 无 |
| `dsh.layout.open-details` | 打开详情面板 | 无 |
| `dsh.layout.close-details` | 关闭详情面板 | 无 |
| `dsh.connection.reconnect` | 重新连接 Host | 无 |
| `dsh.composer.focus` | 聚焦输入框 | 无 |

`Mod` 是跨平台主修饰键，匹配 Ctrl 或 Cmd/Meta。被操作系统或浏览器保留的组合（例如某些地址栏、窗口关闭键）可能不会派发给网页，因此无法由插件覆盖。

### 本插件扩展事件

| 事件 id | 名称 | 默认绑定 |
| :--- | :--- | :--- |
| `dsh-hotkey.history.previous` | 上一条历史输入 | `ArrowUp`（候选菜单未处理后） |
| `dsh-hotkey.history.next` | 下一条历史输入 / 恢复草稿 | `ArrowDown`（候选菜单未处理后） |
| `dsh-hotkey.cursor.page-up` | 光标上移一页（10 个视觉行） | `PageUp`；`Shift+PageUp` 扩展选区 |
| `dsh-hotkey.cursor.page-down` | 光标下移一页（10 个视觉行） | `PageDown`；`Shift+PageDown` 扩展选区 |
| `dsh-hotkey.editor.insert-indent` | 插入 4 个空格 | `Tab`（候选目录未下钻后） |
| `dsh-hotkey.editor.insert-tab` | 插入 Tab 字符 | 无 |

## 设置界面

在 **设置 → Hotkey** 或 **设置 → 可配置插件 → 快捷键 Hotkey** 中：

1. 点击组合键按钮进入录制状态，再按目标组合键。
2. 从事件菜单中选择 DSH、`dsh-hotkey` 或第三方插件事件。
3. 可启用/停用、上移/下移或删除绑定。
4. 同键多行会显示“同键链 n/m”，顺序就是回退优先级。
5. “恢复 DSH + 插件默认值”会恢复上表默认链。

新配置格式：

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

只要旧 `dsh-hotkey` section 中存在 `escStop`、Enter 行为、页光标、历史或 Tab 字段，读取时就会迁移成 bindings，包括旧版的 Numpad / Ctrl / Shift 优先级和修饰键行为。Enter 动作直接映射到 DSH 标准 Queue、Steer、Newline 事件，不再保留旧插件专用兼容事件。迁移行中的 `Any` 表示允许任意附加修饰键；录制的新绑定仍默认采用精确匹配。一旦保存新绑定，`bindings` 成为权威配置；旧字段即使仍留在 YAML 中也会被忽略。完全没有旧 section/字段的安装无法与“从未落盘的旧默认”区分，因此采用新的 DSH 原生默认链。

## 第三方插件注册 Action

需要区分两层依赖：`package.json` 中的
`dsh.client.inject: ['dsh-hotkey']` 用于 client module graph；浏览器 entry
中的 `inject = ['hotkeyRegistry']` 用于 Cordis service。

```ts
import type { HotkeyRegistryV1 } from 'dsh-hotkey/client'

export const inject = ['hotkeyRegistry'] as const

export function apply(ctx: { get?: (id: string) => unknown }): () => void {
  const registry = ctx.get?.('hotkeyRegistry') as HotkeyRegistryV1
  return registry.registerAction({
    id: 'my-plugin.toggle-panel',
    label: '切换我的面板',
    description: '显示或隐藏 my-plugin 面板。',
    category: 'my-plugin',
    scope: 'global',
    invoke() {
      toggleMyPanel()
      return 'handled'
    },
  })
}
```

`HotkeyRegistryV1` 提供 `apiVersion === 1`，以及 `actions` / `dispatch-outcome-v1` capability flags。

约束：

- id 必须是小写命名空间形式，如 `my-plugin.action-name`，并在运行时唯一。
- `invoke` 必须同步返回 `handled`、`continue` 或 `defer-native`；可启动异步任务，但不能等待后再决定是否消费按键。
- `scope: 'composer'` 只在事件源位于当前 composer 时执行；`global` 可在页面任意位置执行。
- 注册函数返回 disposer，插件卸载时 Action 会从目录移除，但用户 binding 仍被保留。
- 旧 `register({ execute() })` 暂时保留兼容，但新插件应使用 `registerAction()`。

## 架构

- `src/settings.ts`：共享绑定契约、事件 id、DSH + 插件默认链及 v1 → v2 迁移。
- `src/index.ts`：Host settings schema，注册 `dsh-hotkey` namespace。
- `src/client/events.ts`：动态事件注册表和第三方插件 API。
- `src/client/hotkey.ts`：组合键解析、录制、标准化和精确匹配。
- `src/client/interceptor.ts`：通用有序 dispatcher 与内置事件执行器。
- `src/client/store.ts`：稳定响应式 snapshot、Host 持久化状态和写入错误。
- `src/client/HotkeySettingsSection.tsx`：动态绑定编辑器。
- `src/client/history.ts` / `history-source.ts`：会话输入历史和引用/图片恢复。
- `src/client/dom.ts`：composer DOM 与选区兼容层。

客户端仍通过 `window.__ModuleLoader__.load({ id, factory })` 协议打包。DSH 0.1.2 尚未公开 keyboard action face，因此候选菜单、Space 裁决和 steerQueue 使用当前 concrete input shell 的兼容桥；检测不到这些私有能力时会 fail-open，把原事件交回 DSH 原生 keymap，而不是误提交或吞键。正式产物写入 `dist/`；旧 `lib/` 不再是 package entry。

## 开发与验证

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

构建产物：`dist/index.js`、`dist/index.d.ts`、`dist/client.js`、`dist/client.js.map`，以及从 source 自动导出的 `dist/types/` browser declarations。安装 Git 依赖或发布前，`prepare` 会自动构建。

安装到 profile：

```bash
dsh plugin --profile web add <本目录路径>
```

新增 plugin row 后需要新启动 DSH Web 才会被初次载入。开发时不要替换正在使用的服务，可另开端口验证：

```bash
dsh web --port 3093 --no-open
```

## License

MIT
