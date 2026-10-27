<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import AvatarLayer from '@/modules/avatar/components/AvatarLayer.vue'
import { avatarBox } from '@/modules/avatar/composables/placement'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { useActivePresentationSource } from '@/composables/useActivePresentationSource'
import { slideImageUrl } from '@/modules/powerpoint/types/powerpoint.types'
import { api } from '@/services/api'
import { useSettingsStore } from '@/stores/settings.store'
import { useOverlayVisibility } from './composables/useOverlayVisibility'

/**
 * The page of the overlay window: the avatar, standing on the bottom of the whole screen. For
 * LouvorJA the background stays fully transparent, same as always - LouvorJA's own window is
 * what the audience actually sees underneath. PowerPoint has no window of its own to be seen
 * under the avatar (the file is only ever read by this app, never opened anywhere else), so this
 * page paints the current slide itself, full-screen, behind the avatar.
 */
const avatar = useAvatarStore()
const { settings } = storeToRefs(useSettingsStore())
let stopCommands: (() => void) | undefined

// The window stays open; the avatar is only seen during the presentation (when the setting asks
// for it): from the first text on the air until the last one is done. Between slides it stays.
const louvorja = useActivePresentationSource()
// (After the presentation ends LouvorJA's last slide is still remembered, so the presentation
// itself has to be open too.)
const presenting = computed(
  () =>
    (louvorja.presentation !== null && louvorja.currentSlide !== null) ||
    // Still finishing the last text, or a test made on the projection page.
    avatar.playing ||
    avatar.paused
)
const visible = useOverlayVisibility(
  presenting,
  computed(() => settings.value.overlayOnlyDuringPresentation)
)

const slideBackgroundUrl = computed(() => {
  if (louvorja.source !== 'powerpoint' || !louvorja.presentation || !louvorja.currentSlide) {
    return null
  }
  return slideImageUrl(louvorja.presentation.id, (louvorja.currentSlide.index ?? 0) + 1)
})

function place(): void {
  const screen = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  avatar.setLayerRect({
    ...avatarBox(screen, settings.value.avatarScale, settings.value.avatarPosition),
    clip: { x: 0, y: 0, width: screen.width, height: screen.height }
  })
}

onMounted(() => {
  // What the system shows for this window (the task list, capture programs such as OBS).
  document.title = 'APP Libras - Overlay'
  place()
  window.addEventListener('resize', place)
  // The projection page can test the avatar: what it plays there plays here too.
  stopCommands = api().overlay.onCommand((command) => avatar.applyCommand(command))
})
watch(() => [settings.value.avatarPosition, settings.value.avatarScale], place)

onBeforeUnmount(() => {
  window.removeEventListener('resize', place)
  stopCommands?.()
})
</script>

<template>
  <div
    class="overlay-root"
    :class="{ hidden: !visible }"
    data-testid="overlay-root"
    :data-visible="visible"
  >
    <img
      v-if="slideBackgroundUrl"
      :src="slideBackgroundUrl"
      class="slide-background"
      alt=""
      data-testid="overlay-slide-background"
    />
    <AvatarLayer />
  </div>
</template>

<style>
/* The window is transparent: nothing may paint a background. */
html,
body {
  margin: 0;
  overflow: hidden;
  background: transparent !important;
}
</style>

<style scoped>
.overlay-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  transition: opacity 0.4s ease;
}

/* The player keeps running underneath: only what is painted changes. */
.overlay-root.hidden {
  opacity: 0;
}

/* Only painted for PowerPoint (see slideBackgroundUrl) - LouvorJA's own window stays visible
   through the transparent background above instead. */
.slide-background {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
