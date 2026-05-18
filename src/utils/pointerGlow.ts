const GLOW_SELECTOR = '.glass-card-enabled, .glass-list-enabled, .glass-footer-enabled, .glass-input-enabled, .glass-task-enabled'

let cleanup: (() => void) | null = null

function hasHoverCapability(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

export function initPointerGlow(): void {
  if (cleanup || typeof document === 'undefined' || !hasHoverCapability()) {
    return
  }

  let activeElement: HTMLElement | null = null

  const clearActive = () => {
    if (!activeElement) {
      return
    }

    activeElement.classList.remove('pointer-glow-surface', 'pointer-glow-active')
    activeElement = null
  }

  const updateGlow = (event: PointerEvent) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(GLOW_SELECTOR)
      : null

    if (!target) {
      clearActive()
      return
    }

    if (activeElement !== target) {
      clearActive()
      activeElement = target
      activeElement.classList.add('pointer-glow-surface', 'pointer-glow-active')
    }

    const rect = target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    target.style.setProperty('--glow-x', `${x}px`)
    target.style.setProperty('--glow-y', `${y}px`)
  }

  const handlePointerLeave = () => {
    clearActive()
  }

  document.addEventListener('pointermove', updateGlow, { passive: true })
  document.addEventListener('pointerleave', handlePointerLeave, { passive: true })
  window.addEventListener('blur', handlePointerLeave)

  cleanup = () => {
    document.removeEventListener('pointermove', updateGlow)
    document.removeEventListener('pointerleave', handlePointerLeave)
    window.removeEventListener('blur', handlePointerLeave)
    clearActive()
    cleanup = null
  }
}

export function destroyPointerGlow(): void {
  cleanup?.()
}
