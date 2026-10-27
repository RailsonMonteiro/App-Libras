import { computed, reactive } from 'vue'
import { usePowerPointStore } from '@/modules/powerpoint/stores/powerpoint.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'

/**
 * Whichever of the two independent slide sources (LouvorJA, PowerPoint) is currently live.
 * LouvorJA always wins when both have an open presentation at once - PowerPoint is only
 * followed when LouvorJA has none (see docs/decisoes.md).
 *
 * `.source` says which one is active - used by OverlayApp.vue to decide whether it must paint the
 * PowerPoint slide itself (that source has no window of its own to be seen under the avatar).
 *
 * Wrapped in reactive() so `.presentation`/`.currentSlide`/`.recentSlides` auto-unwrap on access
 * exactly like a Pinia store's own properties do (Pinia wraps setup stores in reactive() too) -
 * callers that used to read a useLouvorJAStore() instance can swap in this composable with no
 * other change.
 */
export function useActivePresentationSource() {
  const louvorja = useLouvorJAStore()
  const powerpoint = usePowerPointStore()

  const active = computed(() => (louvorja.presentation !== null ? louvorja : powerpoint))
  const source = computed<'louvorja' | 'powerpoint'>(() =>
    louvorja.presentation !== null ? 'louvorja' : 'powerpoint'
  )

  return reactive({
    source,
    presentation: computed(() => active.value.presentation),
    currentSlide: computed(() => active.value.currentSlide),
    recentSlides: computed(() => active.value.recentSlides)
  })
}
