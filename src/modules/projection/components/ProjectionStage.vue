<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import SlidePreview from '@/components/SlidePreview.vue'
import { AVATAR_ASPECT, useAvatarPlacement } from '@/modules/avatar/composables/useAvatarPlacement'
import { useActivePresentationSource } from '@/composables/useActivePresentationSource'
import { useSettingsStore } from '@/stores/settings.store'

/**
 * A 16:9 preview of what the audience sees: the slide, with the avatar standing on top of it,
 * placed and sized as in the settings. (The avatar itself is drawn by the global avatar layer,
 * which is told where this stage is.)
 */
const props = defineProps<{
  /** While the sliders in "Controles" are being dragged, their live value - the avatar follows
   *  the drag instead of waiting for it to settle and save. Falls back to the setting itself. */
  liveScale?: number
  livePosition?: number
}>()

const louvorja = useActivePresentationSource()
const { settings } = storeToRefs(useSettingsStore())
const stage = ref<HTMLElement | null>(null)

const scale = computed(() => props.liveScale ?? settings.value.avatarScale)
const position = computed(() => props.livePosition ?? settings.value.avatarPosition)

useAvatarPlacement(stage, { scale, position })

// Keep the slide text away from the avatar: reserve the width the avatar takes on its side,
// scaled down to nothing as the avatar's position slider nears dead centre (50).
const style = computed(() => {
  const lean = (position.value - 50) / 50 // -1 (left edge) to 1 (right edge)
  if (lean === 0) return {}
  const reserved = (AVATAR_ASPECT * (9 / 16) * scale.value + 4) * Math.abs(lean)
  return { [lean < 0 ? 'paddingLeft' : 'paddingRight']: `${reserved}%` }
})
</script>

<template>
  <div ref="stage" class="stage" data-testid="stage">
    <SlidePreview
      :slide="settings.stageShowSlide ? louvorja.currentSlide : null"
      :style="style"
      test-id="stage-slide"
    />
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--border-radius);
  background: #000;
}
</style>
