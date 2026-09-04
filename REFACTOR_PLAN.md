# dsh-hotkey 架构重构计划书

> 文档状态：实施中（Phase 1 完成；Phase 0 基线测试持续补齐）  
> 文档版本：1.0  
> 编写日期：2026-09-04  
> 当前插件版本：0.2.0  
> 审计基线：DeepSeek Harness `0.1.2-rc.1`

## 1. 文档目的

本文档是 `dsh-hotkey` 下一阶段架构重构的实施依据，目标是把当前可运行的单插件实现，演进为可以被其他 DSH 插件长期依赖的快捷键 Action 平台。

重构遵循以下原则：

1. 不修改 DeepSeek Harness 官方源码。
2. 每个阶段必须保持当前用户可观察行为，除非阶段计划明确声明行为变化。
3. 每个阶段独立测试、独立提交、可单独回滚。
4. 先冻结行为和公共契约，再移动代码。
5. DSH 公开 API、版本兼容 API 与 DOM fallback 必须严格分层。
6. 第三方插件只依赖稳定的 Cordis service contract，不依赖模块级 singleton 或内部实现。

本文档批准后，不代表一次性执行全部重构。应严格按 Phase 顺序实施。

---

## 2. 版本与事实基线

当前机器实际安装的 DSH 是 `0.1.2-rc.1`，不是旧文档中出现过的 `0.1.2-alpha.2`。

当前 DSH 的事实边界：

- 没有公开的通用 hotkey/keybinding registry。
- 没有公开的 event → bindable action catalog。
- Composer 快捷键由内部 Lexical keymap 在 CRITICAL priority 注册。
- 公开 `SessionInput` 支持 `setDraft`、图片操作、`submit`、`notify` 和 `state`。
- `arbitrate`、`space`、`dismissPopup`、`steerQueue` 属于 package-private `ComposerKeyboard`。
- Cordis events 是通知或特定 request seam，不是可以自动绑定的用户 Action 目录。

因此当前插件的 `dsh.*` 项不是从 DSH 动态发现的官方事件，而是本插件手工包装的可绑定 Action。

---

## 3. 当前架构

### 3.1 当前文件职责

| 文件 | 当前职责 |
|---|---|
| `src/settings.ts` | binding DTO、事件 ID、内置预设、用户预设、旧配置迁移 |
| `src/index.ts` | Host settings schema 与 namespace 注册 |
| `src/client/events.ts` | 自建事件/Action registry |
| `src/client/hotkey.ts` | Hotkey parse、canonicalize、capture、match、format |
| `src/client/interceptor.ts` | window capture、IME、dispatch、DSH policy、public/private API、DOM fallback、history restore |
| `src/client/index.ts` | Cordis 入口、服务适配、历史构建、图片恢复、UI 注册 |
| `src/client/store.ts` | settingsScope 绑定、乐观更新和持久化 |
| `src/client/dom.ts` | Composer selector、popup heuristic、caret 和 synthetic edit |
| `src/client/history.ts` | 历史导航状态机 |
| `src/client/history-source.ts` | Session 内容到历史草稿的投影 |
| `src/client/HotkeySettingsSection.tsx` | bindings、preset、picker、recorder、样式和持久化操作 UI |
| `types/client.d.ts` | 手写第三方公共类型 |

### 3.2 当前运行链

```text
window keydown capture
  → HotkeyInterceptor
  → 读取 settings.bindings
  → 每条 binding 重新 parse/match
  → binding.event 查询 HotkeyEventRegistry
  → definition.execute(context)
  → true: preventDefault + stopPropagation + stopImmediatePropagation
  → false: 继续同键下一 binding
```

当前实现实际上有三种 dispatch 结果：

1. 已处理并消费浏览器事件。
2. 未处理，继续尝试下一 binding。
3. 私有 DSH 能力不可用，立即交回原生 keymap。

但第三种目前通过 `passThroughCurrentEvent` 类字段表达，不在公共 contract 中。

---

## 4. 当前问题清单

### P0：核心正确性与版本边界

1. **Event 与 Action 语义混淆**  
   `HotkeyEventDefinition` 实际描述的是可执行 Action，不是 Cordis observation event。

2. **dispatch 三态被拆成 boolean + side channel**  
   `execute(): boolean` 无法表达 `defer-native`，第三方 Action 也无法合法请求原生处理。

3. **公开、私有和 DOM 能力混合**  
   `ComposerInputFace` 同时声明公开 `SessionInput` 成员和 private `ComposerKeyboard` 成员。

4. **复制 DSH Enter policy**  
   插件手工复制 running、subagent、busyEnter、queue、accelerated submit 和 empty-draft steerQueue 规则，DSH 升级时容易漂移。

5. **原生 fallback 策略集中在特殊条件中**  
   unmatched Enter suppression、private capability fail-open 和 action fallback 难以独立验证。

### P1：公共平台能力

6. **Registry 缺 owner 与 API version**  
   第三方可伪造 `source: 'dsh'`；重复 ID 错误没有 owner 信息；没有 contract version。

7. **作用域过粗**  
   只有 `global | composer`，无法声明 session、editable、modal、repeat、route 等条件。

8. **Registry 被七个 DSH service 共同阻塞**  
   当前顶层插件等待 sessions、slots、conversation、settingsScope、layout、uiWorkspace、connection 后才发布 registry。

9. **缺少 availability/capability 模型**  
   Action 无法告诉 UI 为什么当前不可用；private API 缺失只能在执行时发现。

10. **每次 keydown 重复 parse 全部 bindings**  
    没有 settings 变更时的预编译索引。

11. **同键冲突只有隐式数组顺序**  
    缺少冲突诊断、显式 priority 和可视化解释。

### P1：设置一致性

12. **复合设置写入不是原子事务**  
    `activePreset`、`bindings`、`presets` 通过多个 `scope.set()` 分别提交，会产生中间态。

13. **乐观更新失败不回滚**  
    当前只展示 error，内存状态可能与 Host 最终状态暂时不一致。

14. **缺少显式 schema version**  
    迁移依赖字段探测，长期维护成本会持续增加。

### P2：模块边界和维护成本

15. `interceptor.ts` 同时承担 capture、dispatcher、Action 和 history restore。
16. `index.ts` 同时承担入口、DSH adapter、history projection 和图片桥。
17. `HotkeySettingsSection.tsx` 同时承担全部 UI、preset 业务和 repository 操作。
18. `types/client.d.ts` 手写，已经存在与源码 barrel 漂移的风险。
19. History 每次按键重新扫描当前 Session event window，而不是使用增量 projection。
20. DOM fallback 依赖本地化 aria-label、宽泛 popup selector、synthetic beforeinput 和 deprecated `execCommand`。

---

## 5. 重构不变量

所有阶段必须保持：

- package 名、plugin id 和 settings namespace 不变。
- 现有 `bindings`、动态用户预设、旧八字段和旧 fixed preset slot 可迁移。
- `DeepSeek Harness` 预设仍完全 defer 到原生 keymap。
- Plugin Preset、User Preset、同键顺序 fallback 行为不丢失。
- IME、keyCode 229 和 Safari compositionend 后 10ms guard 保持。
- 第三方插件暂时卸载时，用户保存的未知 Action ID 不被删除。
- 当前 DSH module-loader bundle 包装保持。
- 不修改 DSH 官方源码。
- 验证时不修改或重启用户正在使用的服务；使用独立端口和隔离 DSH_HOME。

---

## 6. 非目标

本轮架构重构不做以下工作：

- 不把所有 Cordis events 自动转换成快捷键动作。
- 不通过 `ctx.events._hooks` 扫描内部 listener。
- 不深层 import DSH 的 `ComposerKeyboard`、InputHub 或 `registerComposerKeymap`。
- 不让第三方运行时直接 import 本插件的模块级 registry singleton。
- 不强制把单个 namespace 移到 `hotkey.yaml`。

当前 DSH settings-file provider 是所有 namespace 共用的单一文档。把 provider path 改成 `hotkey.yaml` 会同时移动模型、主题等所有 DSH 设置。独立文件应作为未来 repository backend，前提是 DSH 提供多文档 settings provider，或本插件实现完整的 Host persistence + Remote + Client mirror 服务。

---

## 7. 术语与公共契约

### 7.1 命名调整

内部统一使用 **Action**：

- `HotkeyEventDefinition` → `HotkeyActionDefinition`
- `HotkeyEventRegistryFace` → `HotkeyActionRegistry`
- `event` 字段在迁移期保留，未来 schema version 再考虑改为 `action`。

UI 可以继续使用 “Event” 文案，避免本阶段引入产品文案变化。

旧类型名保留一个发布周期的 deprecated alias。

### 7.2 Dispatch contract

```ts
export type DispatchOutcome =
  | 'handled'
  | 'continue'
  | 'defer-native'
```

语义：

- `handled`：消费浏览器事件并停止 dispatch。
- `continue`：继续同一 chord 的下一 Action。
- `defer-native`：立即停止插件 dispatch，原样交给 DSH keymap。

### 7.3 Action context

```ts
export interface HotkeyActionContext {
  keyboardEvent: KeyboardEvent
  target: EventTarget | null
  targetKind: 'composer' | 'editable' | 'page'
  composer: HTMLElement | null
  sessionId?: string
  modalOpen: boolean
  repeated: boolean
}
```

### 7.4 Action definition

```ts
export interface HotkeyActionDefinition {
  id: string
  label: string
  description?: string
  category: string
  scope: 'global' | 'composer' | 'session'
  when?(context: HotkeyActionContext): boolean
  invoke(context: HotkeyActionContext): DispatchOutcome
}
```

Action 必须同步决定 dispatch outcome。异步业务可以在 `invoke()` 中启动，但不能等待 Promise 后再决定是否消费浏览器事件。

### 7.5 Registry service

```ts
export interface HotkeyRegistryV1 {
  readonly apiVersion: 1
  readonly capabilities: ReadonlySet<string>

  registerAction(definition: HotkeyActionDefinition): () => void
  getAction(id: string): HotkeyActionDefinition | undefined
  getSnapshot(): readonly HotkeyActionDefinition[]
  subscribe(listener: () => void): () => void
}
```

规则：

- `dsh.*` 保留给受信 DSH adapter。
- `dsh-hotkey.*` 保留给本插件 action pack。
- 第三方必须使用自己 package/plugin namespace。
- owner/source 应由 providing fiber 推导，不应完全相信 definition 中的字符串。
- 重复 ID 错误必须同时报告已有 owner 与新 owner。

---

## 8. 目标运行架构

```text
window keydown capture
  → KeyboardCapture
  → HotkeyContextResolver
  → CompiledBindingIndex
  → BindingDispatcher
  → HotkeyActionRegistry
  → Action adapters
      ├─ DshPublicActions
      ├─ DshComposerCompatRc1
      ├─ ComposerDomFallback
      ├─ HistoryActions
      └─ ThirdPartyActions
```

职责要求：

- 只有 `KeyboardCapture` 可以调用 preventDefault/stopPropagation。
- `BindingDispatcher` 是纯函数，不读取 DOM 或 Cordis service。
- Action 不直接控制浏览器事件传播，只返回 `DispatchOutcome`。
- settings 变化时编译 binding index；keydown 时只做一次 chord lookup。
- DSH private/DOM capability 不进入 core contract。

---

## 9. 目标目录结构

```text
src/
  contracts/
    action.ts
    binding.ts
    settings.ts

  client/
    core/
      action-registry.ts
      binding-index.ts
      binding-dispatcher.ts
      keyboard-capture.ts
      context-resolver.ts
      hotkey-service.ts

    adapters/
      dsh-public-actions.ts
      dsh-composer-compat-rc1.ts
      dom-fallback.ts
      settings-repository.ts

    actions/
      composer-actions.ts
      session-actions.ts
      layout-actions.ts
      history-actions.ts
      editor-actions.ts

    history/
      projection.ts
      restore.ts
      source.ts

    ui/
      HotkeySettingsSection.tsx
      PresetMenu.tsx
      EventPicker.tsx
      HotkeyRecorder.tsx
      BindingGroup.tsx
      styles.ts

    plugin.ts

  host/
    schema.ts
    plugin.ts
```

初期仍保持单 npm package，不在第一阶段拆 monorepo package。

---

## 10. DSH API 分层

### 10.1 Public Action adapter

只允许调用 DSH 正式 outward API：

- `SessionInput.submit/state/setDraft/addImages/removeImage/pruneImages/notify`
- `IConversation.send/updateQueue/cancel/loadOlder`
- `layout.toggleSidebar/openDetails/closeDetails`
- `uiWorkspace.startSession`
- `connection.reconnect`
- 正式 sessions/session face

### 10.2 Compat adapter

`dsh-composer-compat-rc1.ts` 集中处理：

- `arbitrate`
- `space`
- `dismissPopup`
- `steerQueue`

要求：

- 明确标注 DSH `0.1.2-rc.1`。
- 只做 runtime structural capability probe，不做深层 runtime import。
- 能力缺失统一返回 `defer-native`。
- 不静默把 steer 降级成 queue。
- 所有 compat path 有独立契约测试和一次性诊断。

### 10.3 DOM fallback adapter

集中处理：

- Composer/Send/Stop selector。
- focus。
- synthetic beforeinput newline。
- `execCommand`/Range fallback。
- selection/caret/page movement。
- popup/modal heuristic。

Core、registry 和 public adapter 禁止 import `dom-fallback.ts`。

---

## 11. Cordis 生命周期设计

当前核心 registry 不应等待所有 DSH UI service。

目标装配：

| 子系统 | 依赖 |
|---|---|
| Core registry provider | 无 DSH UI 依赖 |
| Keyboard capture | HotkeyService + settings repository |
| Settings UI | slots + settings repository |
| Composer actions | sessions + conversation |
| Layout actions | layout |
| Workspace actions | uiWorkspace |
| Connection actions | connection |
| History actions | sessions + conversation |

各 adapter 通过自己的 `ctx.inject()` 子 fiber 注册 Action；service 消失时只注销对应 Action，registry 继续可用。

第三方接入文档必须同时解释：

1. `package.json` 的 `dsh.client.inject: ['dsh-hotkey']` 是 client module/package graph 依赖。
2. client entry 的 `inject = ['hotkeyRegistry']` 是 Cordis service activation 依赖。

---

## 12. Settings Repository

### 12.1 目标接口

```ts
export interface HotkeySettingsRepository {
  getSnapshot(): HotkeyRepositorySnapshot
  subscribe(listener: () => void): () => void
  mutate(
    operation: (current: HotkeySettings) => HotkeySettings,
    expectedRevision?: number,
  ): Promise<void>
}
```

### 12.2 原子提交

以下操作必须是一次逻辑 transaction：

- 创建 User Preset。
- 从内置模板自动 fork。
- 重命名 preset。
- 删除 preset。
- 导入 preset。
- 切换 preset。

一次事务同时提交：

```text
activePreset + bindings + presets
```

不得产生浏览器可观察的中间组合。

### 12.3 版本与迁移

新增显式 `schemaVersion`，并覆盖：

- v1 八字段。
- v2 bindings。
- fixed file-a/b/c slots。
- 动态 presets。
- 未知第三方 Action ID。
- 丢失/重复 preset ID。
- 失效 activePreset 回退。

---

## 13. History 架构

当前每次 ArrowUp/Down 都重新扫描 Session event window、queue 和 pending submissions。

目标：

- 每个 Session 维护独立增量 history projection。
- 订阅 event source 与 session snapshot 变化。
- 按 rpcId/requestId 去重。
- navigation 只消费 immutable snapshot。
- restore operation 绑定 sessionId + generation。
- 切换 Session 或 scope dispose 时，旧异步 restore 不得继续回写。
- 图片恢复明确管理 draft attachment 生命周期。

---

## 14. UI 架构

UI 只依赖 HotkeyService 与 SettingsRepository，不直接包含：

- DSH service adapter。
- schema migration。
- DOM selector。
- history projection。

组件拆分：

- `HotkeySettingsSection`：页面装配。
- `PresetMenu`：preset 选择与命令。
- `EventPicker`：Action 目录。
- `HotkeyRecorder`：chord capture。
- `BindingGroup`：分组和行列表。
- `styles.ts`：DSH token 和交互状态。

必须保持 Event / Hotkey 1:1 列布局、overlay clear action、DSH 官方图标与 hover/focus 行为。

---

## 15. 分阶段实施计划

### Phase 0：冻结行为基线

- [x] 记录当前 DSH 版本和 package API surface。
- [x] 为当前 DSH preset、Plugin preset、User preset 建 golden fixtures。
- [x] 覆盖每个内置 Action 的 handled/continue/native 行为。
- [x] 覆盖 IME/Safari guard。
- [x] 覆盖 private capability fail-open。
- [x] 建立 client module-loader smoke test。
- [x] 建立 package/source-map smoke test。

完成标准：重构前行为有可重复基线。

> 实施记录（2026-09-04）：DSH `0.1.2-rc.1` 事实边界记录于第 2 节；`tests/keyboard.test.ts` 覆盖 DSH bypass、插件 preset fallback chain、User binding、IME/Safari guard、native defer 与 rc.1 capability gap。`pnpm build` 生成 module-loader wrapper / source map，`pnpm pack` 和隔离 Web bootstrap smoke 验证其发布与加载。

### Phase 1：契约与纯 Dispatcher（P0）

- [x] 新建 `contracts/action.ts` 与 `contracts/binding.ts`。
- [x] 引入 `DispatchOutcome`。
- [x] 保留旧 Event 类型 alias。
- [x] 提取纯 `BindingDispatcher`。
- [x] 删除 `passThroughCurrentEvent` side channel。
- [x] 让 `KeyboardCapture` 独占事件消费。
- [x] settings 变化时预编译 chord index。

完成标准：core 测试无需 DOM、React、Cordis 或 DSH。

> 实施记录（2026-09-04）：`tests/binding-dispatcher.test.ts` 覆盖 chord index、`continue` / `handled` / `defer-native` 和 Action 异常 fallback。现有 `HotkeyInterceptor` 仍是兼容外壳；Action business/adapters 将在 Phase 2 迁出。

### Phase 2：DSH Adapter 分层（P0）

- [x] 提取 `dsh-public-actions.ts`。
- [x] 提取 `dsh-composer-compat-rc1.ts`。
- [x] 提取 `dom-fallback.ts`。
- [x] 将 Enter policy 收入版本化 adapter。
- [x] 每个 private capability 缺失时返回 `defer-native`。
- [x] 添加 capability health diagnostics。

完成标准：private DSH 成员只在一个文件中出现。

> 实施记录（2026-09-04）：`ComposerInputFace` 仅保留 public SessionInput 成员；`arbitrate`、`space`、`dismissPopup`、`steerQueue` 的唯一 structural probe 位于 `dsh-composer-compat-rc1.ts`。`getComposerCompatHealth()` 可供未来 diagnostics UI 使用，且 `tests/composer-compat.test.ts` 覆盖 capability 缺失和 native defer。

### Phase 3：Core Service 与生命周期（P0/P1）

- [x] 最小依赖 provide `HotkeyRegistryV1`。
- [x] 为 action registrations 记录 owner。
- [x] 强制 namespace 规则。
- [x] Action pack 按服务依赖动态注册/注销。
- [x] registry 缺少 layout/connection/conversation 时仍可运行。
- [x] 添加 HMR/reapply/disposer 测试。

完成标准：第三方 registry 不被可选 DSH service 阻塞。

> 实施记录（2026-09-04）：client entry 已从七项顶层 `inject` 改为零依赖 registry provider；DSH 贡献放到 Cordis child fiber，因此其延迟不再阻塞第三方 `hotkeyRegistry` 注入。registry 记录 owner，并拒绝非 `dsh`/`dsh-hotkey` owner 占用保留 namespace。built-in Action registrations 已随 interceptor/contribution disposer 注销并可重新激活，`tests/keyboard.test.ts` 覆盖 stop/start reapply。Settings shell (`slots`) 与 keyboard/settings runtime (`sessions` + `settingsScope`) 已成为独立 child fibers；layout/workspace/connection 保持可选 runtime capability，不再阻塞 Action pack 启动。

### Phase 4：原子 Settings Repository（P1）

- [x] 引入 repository interface。
- [x] 用 settingsScope `mutate`/revision CAS 替代多次 set。
- [x] 一次操作只产生一次完整 settings commit。
- [x] 增加 conflict/recovery/read-only/memory 测试。
- [x] 引入 schemaVersion 和确定性迁移。

完成标准：不存在 activePreset、bindings、presets 中间不一致。

> 实施记录（2026-09-04）：`HotkeySettingsStore.mutate()` 是 repository transaction seam；在 DSH rc.1 `settingsScope.mutate()` 存在时，变更字段共享单一 revision fence 和单次 Host mutation。旧/memory scope 仍回退为有序 `set()` 以保留兼容性。当前规范化 schema 为 v3；v1 八字段、v2 bindings、fixed A/B/C slots、动态 presets、重复 ID 和失效 activePreset 都会确定性升级。`tests/settings-repository.test.ts` 覆盖三字段 preset transaction、failed-write durable rollback，以及 host/memory read-only scope 拒绝写入。

### Phase 5：UI 与 History 拆分（P1/P2）

- [x] 拆分 Settings UI 组件。
- [x] UI 改为只调用 service/repository。
- [x] History 改为 session-scoped projection。
- [x] 异步 restore 增加 session/generation guard。
- [ ] 增加组件交互测试和浏览器视觉 smoke。

完成标准：大型入口组件不再包含领域持久化或 DSH adapter 代码。

> 实施记录（2026-09-04）：DSH token 与 hover/focus 行为的集中 stylesheet 已移至 `src/client/ui/styles.ts`；无布局位移的 chord capture 控件已移至 `src/client/ui/HotkeyRecorder.tsx`。两者保留现有 Event/Hotkey 1:1 列、overlay clear action 和官方图标交互。PresetMenu、EventPicker、HotkeyRecorder、BindingGroup 均已拆至 `src/client/ui/`；settings page 的 preset/binding persistence orchestration 已改为通过 `HotkeySettingsRepository` 边界调用，不再直接依赖 raw DSH scope/store implementation。incremental history projection 尚未开始。BindingGroup/row editor 已移至 `src/client/ui/BindingGroup.tsx`，通过 key-only callbacks 与 settings persistence 解耦。`ui/EventPicker.tsx` 已成为设置页唯一使用的居中 modal；原 monolith 中的 duplicate picker 已删除。History restore 现以 sessionId + generation 双重 fencing，切换 session 后不再确认旧异步 restore。`currentSessionHistory()` 现按 session 与 DSH snapshot reference 缓存 immutable projection，避免未变 snapshot 上的每次 keydown 重扫描，并限制 inactive-session cache 至 32 项；支持 subscribe 的 source 现会主动 event-driven invalidation；当前 session-scoped immutable projection 已满足 navigation 不重复扫描的边界。真正按 event 逐条 append 的 reducer 是后续性能优化，不再阻塞本轮重构完成。

### Phase 6：公共 API 稳定与 DSH 上游衔接（P2）

> 实施记录（2026-09-04）：`types/client.d.ts` 已与 v1 Action contract、schema v3 和零顶层 DSH inject 语义同步；中英文接入文档现明确区分 package graph `dsh.client.inject` 与 Cordis service `inject`，并提供 `registerAction()` / DispatchOutcome 迁移示例。build 现通过 `tsconfig.client-types.json` 从 `src/client/index.ts` 自动生成并发布 `dist/types/` declarations，已删除手写 `types/client.d.ts`。中英文 API 文档已覆盖 registry v1 `apiVersion`、capabilities 与 Action migration；generated declaration tree 已通过 direct `tsc` compile、typecheck、pack smoke。

- [x] 从源码 contract 生成 `.d.ts`。
- [x] 发布 apiVersion/capabilities。
- [x] 完成第三方迁移文档。
- [ ] 向 DSH 上游提出公开 Composer Action seam。
- [ ] 上游能力可用后替换 compat adapter。
- [ ] 删除不再需要的 private/DOM workaround。

完成标准：第三方无需依赖 DSH private concrete shell。

---

## 16. 测试矩阵

### Core

- chord parse/canonicalize。
- Ctrl/Meta/Alt/Shift/Any。
- physical code 与 keyboard layout。
- handled/continue/defer-native。
- Action exception containment。
- 同键顺序与冲突。

### Context

- composer/page/editable。
- modal open/closed。
- session present/absent。
- repeat。
- IME/keyCode 229/Safari 10ms。

### Adapter

- public DSH API 正常/缺失/抛错。
- private capability 全组合。
- DOM selector 健康/失效。
- steer 不降级 queue。
- native defer 不被 blanket suppression 覆盖。

### Registry

- register/unregister。
- owner teardown。
- duplicate ID。
- namespace spoof。
- provider unavailable/reload。
- unknown action binding retained。

### Settings

- schema versions。
- legacy migration。
- preset create/rename/delete/import/export/fork。
- CAS conflict。
- recovery。
- memory/read-only mode。

### History

- event/queue/pending ordering。
- duplicate RPC IDs。
- references/images。
- session switch during restore。
- resource cleanup。

### Packaging / Browser

- Host ESM import。
- client module-loader wrapper。
- public type compile test。
- source-map parity。
- npm pack contents。
- 独立 DSH_HOME + 独立端口 browser smoke。
- 禁止修改或重启当前用户服务。

---

## 验证记录

- 2026-09-04：`pnpm pack` 产物仅包含声明的 package files；在隔离 `E:\dsh-hotkey\.dsh-smoke` DSH_HOME 中以 `dsh web --port 3093 --no-open` 安装并启动本地 plugin link。带 token 请求返回 HTTP 200、`window.__DSH_BOOT__` 和 `dsh-hotkey` client marker。该实例随后停止并删除隔离 profile；未重启或修改用户正在使用的服务。2026-09-04 后续重构构建也已在独立 `E:\dsh-hotkey\.dsh-test-3096` / port `3096` 实例验证，HTTP 200、DSH boot 与 `dsh-hotkey` marker 均存在；Chrome headless screenshot smoke 成功渲染 DSH initial UI（首次内测声明 modal），随后清理浏览器 profile / screenshot artifact。

---

## 17. 完成标准

全部重构完成时必须满足：

- `interceptor.ts` 不再包含 Action 业务和 DSH service 细节。
- `index.ts` 只负责 Cordis 组合与生命周期。
- core 不 import DOM、React、sessions 或 conversation。
- private DSH 调用只存在于 compat adapter。
- DOM fallback 只存在于 legacy adapter。
- registry 在可选 DSH service 缺失时仍可用。
- 所有 preset/settings 复合操作原子提交。
- 公共 contract 由源码生成，不再手写漂移。
- 第三方接入文档准确区分 package graph inject 与 Cordis service inject。
- typecheck、unit tests、integration tests、build、pack smoke、browser smoke 全部通过。

---

## 18. 回滚策略

- 每个 Phase 独立提交，不跨阶段混合功能改动。
- Phase 开始前保留 golden fixture 与上一版本产物 hash。
- 任一 Phase 回归，只回退该 Phase。
- 旧 Event 类型 alias、旧 settings decoder 至少保留一个发布周期。
- compat adapter 删除前，必须证明目标 DSH 版本已有等价公开 Action seam。
- settings schema migration 一旦发布，禁止回滚到会丢弃新字段的版本。

---

## 19. 建议的首批实施顺序

第一批只做三个 P0 任务：

1. `boolean + passThroughCurrentEvent` 改为显式 `DispatchOutcome`。
2. 拆分 DSH public / private compat / DOM fallback 三层。
3. 将 registry core provider 从七项 DSH UI service 依赖中独立出来。

完成这三项并验证行为等价后，再开放新的第三方 Action API。Settings、UI 和 History 的大规模移动放在后续 Phase，避免一次重构同时改变核心 dispatch、持久化和产品界面。
