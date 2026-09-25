import { onScopeDispose, watch } from 'vue'
import { useAppStore } from '@/stores/app'

/**
 * 全局「卡片鼠标亮光」效果
 *
 * 通过 document 级事件委托监听 pointermove，为带 .glow-card 类的卡片
 * 更新 --glow-x / --glow-y CSS 变量；亮光本体由 main.scss 中
 * .glow-card::after 的径向渐变渲染，颜色跟随主题主色（--primary-color）。
 *
 * - 仅响应鼠标指针（pointerType === 'mouse'），触屏设备不触发；
 * - 开关由主题设置 cardMouseGlow 控制，并同步 html.glow-enabled 类；
 * - 单个全局监听器 + passive，避免为每张卡片单独绑定事件。
 */
export function useMouseGlow() {
  const appStore = useAppStore()

  let bound = false

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse')
      return

    const target = event.target as Element | null
    const card = target?.closest?.('.glow-card') as HTMLElement | null
    if (!card)
      return

    const rect = card.getBoundingClientRect()
    card.style.setProperty('--glow-x', `${event.clientX - rect.left}px`)
    card.style.setProperty('--glow-y', `${event.clientY - rect.top}px`)
  }

  function bind(): void {
    if (bound)
      return
    bound = true
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
  }

  function unbind(): void {
    if (!bound)
      return
    bound = false
    document.removeEventListener('pointermove', handlePointerMove)
  }

  watch(
    () => appStore.cardMouseGlow,
    (enabled) => {
      document.documentElement.classList.toggle('glow-enabled', enabled)
      if (enabled)
        bind()
      else
        unbind()
    },
    { immediate: true },
  )

  onScopeDispose(unbind)
}
