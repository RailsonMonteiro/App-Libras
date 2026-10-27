import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useActivePresentationSource } from '@/composables/useActivePresentationSource'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { usePowerPointStore } from '@/modules/powerpoint/stores/powerpoint.store'
import type { Slide } from '@/types/presentation'

const slide = (id: string, text = id): Slide => ({
  id,
  presentationId: 'p',
  index: null,
  total: null,
  title: null,
  text,
  nextText: null,
  kind: 'text',
  receivedAt: 'x'
})

describe('useActivePresentationSource', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is null when neither source has an open presentation', () => {
    const active = useActivePresentationSource()
    expect(active.presentation).toBeNull()
    expect(active.currentSlide).toBeNull()
    expect(active.source).toBe('powerpoint')
  })

  it('follows PowerPoint when only it has an open presentation', () => {
    const powerpoint = usePowerPointStore()
    powerpoint.presentation = { id: 'pp', title: 'Sermão', startedAt: 'x' }
    powerpoint.currentSlide = slide('s1', 'TEXTO')

    const active = useActivePresentationSource()
    expect(active.presentation?.id).toBe('pp')
    expect(active.currentSlide?.text).toBe('TEXTO')
    expect(active.source).toBe('powerpoint')
  })

  it('LouvorJA always wins when both have an open presentation', () => {
    const louvorja = useLouvorJAStore()
    const powerpoint = usePowerPointStore()
    powerpoint.presentation = { id: 'pp', title: 'Sermão', startedAt: 'x' }
    powerpoint.currentSlide = slide('ppSlide', 'DO POWERPOINT')
    louvorja.presentation = { id: 'lj', title: 'Culto', startedAt: 'x' }
    louvorja.currentSlide = slide('ljSlide', 'DO LOUVORJA')

    const active = useActivePresentationSource()
    expect(active.presentation?.id).toBe('lj')
    expect(active.currentSlide?.text).toBe('DO LOUVORJA')
    expect(active.source).toBe('louvorja')
  })

  it('switches back to PowerPoint once LouvorJA has no presentation open anymore', () => {
    const louvorja = useLouvorJAStore()
    const powerpoint = usePowerPointStore()
    louvorja.presentation = { id: 'lj', title: 'Culto', startedAt: 'x' }
    powerpoint.presentation = { id: 'pp', title: 'Sermão', startedAt: 'x' }
    powerpoint.currentSlide = slide('ppSlide', 'DO POWERPOINT')

    const active = useActivePresentationSource()
    expect(active.presentation?.id).toBe('lj')
    expect(active.source).toBe('louvorja')

    louvorja.presentation = null
    louvorja.currentSlide = null
    expect(active.presentation?.id).toBe('pp')
    expect(active.currentSlide?.text).toBe('DO POWERPOINT')
    expect(active.source).toBe('powerpoint')
  })
})
