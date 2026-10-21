import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useAvatarStore } from '../stores/avatar.store'
import { avatarBox } from './placement'

export { AVATAR_ASPECT } from './placement'

/** While a slider is being dragged, its live value takes over from the (debounced) setting, so
 *  the avatar follows the drag instead of waiting for it to settle and save. */
export interface AvatarPlacementOverrides {
  scale?: Ref<number>
  position?: Ref<number>
}

/**
 * Tells the avatar layer where to stand: on the bottom of `stage`, at the side, and as tall as
 * the settings say. Follows the stage when the window is resized or the page scrolls. Gives the
 * spot back when the page goes away.
 */
export function useAvatarPlacement(
  stage: Ref<HTMLElement | null>,
  overrides?: AvatarPlacementOverrides
): void {
  const avatar = useAvatarStore()
  const { settings } = storeToRefs(useSettingsStore())
  let observer: ResizeObserver | null = null
  let scroller: Element | null = null

  function update(): void {
    const element = stage.value
    if (!element) return

    const box = element.getBoundingClientRect()
    const scale = overrides?.scale?.value ?? settings.value.avatarScale
    const position = overrides?.position?.value ?? settings.value.avatarPosition
    const place = avatarBox(box, scale, position)

    // Never draw outside the stage, nor over the parts of the window around a scrolling page.
    const area = (scroller ?? document.body).getBoundingClientRect()
    const left = Math.max(box.left, area.left)
    const top = Math.max(box.top, area.top)
    const right = Math.min(box.right, area.right)
    const bottom = Math.min(box.bottom, area.bottom)

    avatar.setLayerRect({
      ...place,
      clip: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
    })
  }

  const onScroll = (): void => update()
  const onResize = (): void => update()

  onMounted(() => {
    scroller = stage.value?.closest('.content') ?? null
    observer = new ResizeObserver(update)
    if (stage.value) observer.observe(stage.value)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    update()
    // The page transition (App.vue) still has the page being LEFT in normal flow for a couple of
    // frames after this one is mounted, before its "position: absolute, out of flow" leave class
    // actually takes - reading the stage's rect right now can catch it mid-way, pushed down by
    // the leaving page's own height. Measuring again two frames later lands after that settles
    // (confirmed live: without this, coming back to this page could park the avatar below the
    // visible area and clip it away entirely).
    requestAnimationFrame(() => requestAnimationFrame(update))
  })

  watch(
    () => [
      overrides?.position?.value ?? settings.value.avatarPosition,
      overrides?.scale?.value ?? settings.value.avatarScale
    ],
    update,
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    scroller?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    avatar.setLayerRect(null)
  })
}
