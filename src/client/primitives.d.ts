/**
 * 类型垫片：@deepseek-ai/dsh-client-ui-primitives（DSH 官方控件库）。
 * 运行时由 shell 模块表解析（tsdown CLIENT_EXTERNALS 已外置），
 * 这里只声明本插件实际使用的导出。
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode } from 'react'

  export interface IconProps {
    size?: number
    className?: string
    [key: string]: unknown
  }
  export const IconChevronDownOutline14: (props: IconProps) => ReactNode
  export const IconChevronRightOutline14: (props: IconProps) => ReactNode
  export const IconCloseOutline16: (props: IconProps) => ReactNode
}
