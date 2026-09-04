# dsh-hotkey v2：动态事件 + Hotkey

## 约束

- 不修改 DeepSeek Harness 官方源码，只提供 profile 外置插件。
- 快捷键和行为解耦；用户配置有序 `bindings`。
- DSH 原生 composer 键盘仲裁必须保留：候选菜单优先，未处理时才进入发送、历史或缩进事件。
- 第三方浏览器插件可以通过 `hotkeyRegistry` 注册/卸载事件。
- 旧版 8 个硬编码字段读取时迁移为等价绑定。

## 数据模型

```ts
interface HotkeyBinding {
  id: string
  event: string
  hotkey: string
  enabled: boolean
}

interface HotkeySettings {
  bindings: HotkeyBinding[]
}
```

同键绑定按数组顺序构成回退链。事件执行器同步返回 boolean：`true` 消费按键并停止；`false` 继续下一行。

## 内置目录

- DSH composer：候选 previous/next/accept/drill/dismiss、Space 裁决、primary/alternate/queue/steer submit、newline、focus。
- DSH 页面/会话：cancel、start-new、toggle-sidebar、open/close-details、reconnect。
- 插件扩展：history previous/next、cursor page-up/page-down、insert-indent、insert-tab。

完整默认绑定与第三方注册示例见 `README.zh.md`。

## 验收

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- 模拟 DSH module loader 执行 `dist/client.js`
- 在不同端口启动新的 `dsh web`，通过浏览器确认 Hotkey 动态编辑器、旧字段到 DSH 标准事件的迁移和无运行时异常
