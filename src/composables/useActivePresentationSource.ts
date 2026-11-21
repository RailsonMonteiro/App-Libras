import { computed, reactive } from 'vue'
import { usePowerPointStore } from '@/modules/powerpoint/stores/powerpoint.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useSpeechStore } from '@/modules/speech/stores/speech.store'

export type PresentationSource = 'speech' | 'louvorja' | 'powerpoint'

/**
 * Whichever of the independent sources of text (microphone, LouvorJA, PowerPoint) is currently
 * live. The microphone wins while it is on - someone turned it on on purpose, right now. Then
 * LouvorJA, whenever it has an open presentation; PowerPoint is only followed when neither of the
 * other two has anything (see docs/decisoes.md).
 *
 * Wrapped in reactive() so `.presentation`/`.currentSlide`/`.recentSlides` auto-unwrap on access
 * exactly like a Pinia store's own properties do (Pinia wraps setup stores in reactive() too) -
 * callers that used to read a useLouvorJAStore() instance can swap in this composable with no
 * other change.
 */
export function useActivePresentationSource() {
  const louvorja = useLouvorJAStore()
  const powerpoint = usePowerPointStore()
  const speech = useSpeechStore()

  const source = computed<PresentationSource>(() => {
    if (speech.presentation !== null) return 'speech'
    return louvorja.presentation !== null ? 'louvorja' : 'powerpoint'
  })
  const active = computed(() =>
    source.value === 'speech' ? speech : source.value === 'louvorja' ? louvorja : powerpoint
  )

  return reactive({
    source,
    presentation: computed(() => active.value.presentation),
    currentSlide: computed(() => active.value.currentSlide),
    recentSlides: computed(() => active.value.recentSlides)
  })
}
