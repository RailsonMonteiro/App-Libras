<script setup lang="ts">
// "Avatares", "Ajustes de interpretação", "Como está sendo projetado" and "Slides recebidos"
// use Phosphor Icons glyphs (MIT, see NOTICE.md), "regular" family - the same one already
// loaded for the navbar's Slides icon.
import '@phosphor-icons/web/regular/style.css'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ToggleRow from '@/components/ToggleRow.vue'
import AvatarPicker from '@/modules/avatar/components/AvatarPicker.vue'
import SignProgress from '@/modules/avatar/components/SignProgress.vue'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { AVATAR_POSITION_RANGE, AVATAR_SPEED_RANGE } from '@/modules/avatar/types/avatar.types'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useOverlayStore } from '@/modules/overlay/stores/overlay.store'
import { useSettingsStore } from '@/stores/settings.store'
import { AVATAR_SCALE_RANGE, type AppSettings } from '@/types/settings'
import ProjectionStage from './components/ProjectionStage.vue'
import SyncStatus from './components/SyncStatus.vue'

const { t } = useI18n()
const avatar = useAvatarStore()
const libras = useLibrasStore()
const louvorja = useLouvorJAStore()
const overlay = useOverlayStore()
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

/** What the avatar would sign for the slide on screen. */
const translation = computed(() =>
  louvorja.currentSlide ? libras.get(louvorja.currentSlide.text) : null
)

/** Most recent first - the same list Slides shows, moved here (see "Slides recebidos" below). */
const history = computed(() => [...louvorja.recentSlides].reverse())
const keyOf = (slide: { id: string; receivedAt: string }): string =>
  `${slide.id}@${slide.receivedAt}`

/** Used by "Test" while no slide has arrived, so a new avatar can be seen in action. */
const SAMPLE_GLOSS = 'DEUS AMOR'

/** "Ajustes" collapses: closed by default, opens on click, closes again on a second click on its
 *  header or anywhere outside it. */
const adjustmentsOpen = ref(false)
const adjustmentsCardRef = ref<HTMLElement | null>(null)

function toggleAdjustments(): void {
  adjustmentsOpen.value = !adjustmentsOpen.value
}

function onDocumentMousedown(event: MouseEvent): void {
  if (!adjustmentsOpen.value) return
  if (!adjustmentsCardRef.value?.contains(event.target as Node)) adjustmentsOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentMousedown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMousedown))

const statusText = computed(() => {
  if (avatar.status === 'ready') {
    if (avatar.paused) return t('projection.status.paused')
    if (avatar.playing && avatar.counter.max > 0) {
      return t('projection.status.playing', {
        count: avatar.counter.count,
        max: avatar.counter.max
      })
    }
    return t('projection.status.ready')
  }
  return t(`projection.status.${avatar.status}`, { progress: avatar.progress })
})

const statusColor = computed(
  () =>
    ({
      checking: 'grey',
      unavailable: 'error',
      loading: 'warning',
      ready: avatar.playing ? 'primary' : 'success',
      error: 'error'
    })[avatar.status]
)

function change<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  void settingsStore.update(key, value)
}

// The sliders move the avatar on the stage while they are dragged, but only the value they stop
// on is saved (a short pause after the last movement).
const scale = ref(settings.value.avatarScale)
const speed = ref(settings.value.avatarSpeed)
const position = ref(settings.value.avatarPosition)
watch(
  () => settings.value.avatarScale,
  (value) => (scale.value = value)
)
watch(
  () => settings.value.avatarSpeed,
  (value) => (speed.value = value)
)
watch(
  () => settings.value.avatarPosition,
  (value) => (position.value = value)
)

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function saveSoon<K extends 'avatarScale' | 'avatarSpeed' | 'avatarPosition'>(
  key: K,
  value: number
): void {
  clearTimeout(saveTimers.get(key))
  saveTimers.set(
    key,
    setTimeout(() => change(key, value), 200)
  )
}
watch(scale, (value) => saveSoon('avatarScale', value))
watch(speed, (value) => saveSoon('avatarSpeed', value))
watch(position, (value) => saveSoon('avatarPosition', value))

// What is done here is done in the overlay window too, when it is open.
function play(): void {
  const gloss = translation.value?.gloss || SAMPLE_GLOSS
  avatar.play(gloss)
  overlay.mirror({ type: 'play', gloss })
}

function stop(): void {
  avatar.stop()
  overlay.mirror({ type: 'stop' })
}

function repeat(): void {
  avatar.repeat()
  overlay.mirror({ type: 'repeat' })
}

function togglePause(): void {
  const pausing = !avatar.paused
  avatar.togglePause()
  overlay.mirror({ type: pausing ? 'pause' : 'resume' })
}
</script>

<template>
  <div class="projection-layout">
    <div class="page-container">
      <v-row>
        <v-col cols="12" lg="4" class="d-flex flex-column ga-5">
          <v-card :title="$t('projection.avatar')">
            <template #prepend>
              <i class="card-icon-ph ph ph-user-sound" />
            </template>
            <v-card-text>
              <AvatarPicker />
            </v-card-text>
          </v-card>

          <div ref="adjustmentsCardRef">
            <v-card>
              <v-card-item
                class="adjustments-toggle"
                role="button"
                tabindex="0"
                :aria-expanded="adjustmentsOpen"
                data-testid="adjustments-toggle"
                @click="toggleAdjustments"
                @keydown.enter="toggleAdjustments"
                @keydown.space.prevent="toggleAdjustments"
              >
                <template #prepend>
                  <i class="card-icon-ph ph ph-sliders-horizontal" />
                </template>
                <v-card-title>{{ $t('projection.controls') }}</v-card-title>
                <template #append>
                  <v-icon
                    class="adjustments-chevron"
                    :class="{ 'adjustments-chevron-open': adjustmentsOpen }"
                  >
                    mdi-chevron-down
                  </v-icon>
                </template>
              </v-card-item>

              <v-expand-transition>
                <v-card-text v-show="adjustmentsOpen">
                  <div class="slider-row mb-5">
                    <span class="text-subtitle-2">{{ $t('projection.speed') }}</span>
                    <v-slider
                      v-model="speed"
                      :min="AVATAR_SPEED_RANGE.min"
                      :max="AVATAR_SPEED_RANGE.max"
                      :step="AVATAR_SPEED_RANGE.step"
                      color="primary"
                      density="compact"
                      hide-details
                      show-ticks
                      thumb-size="14"
                      track-size="3"
                      class="slider-track"
                      data-testid="avatar-speed"
                    />
                    <span class="slider-value">{{ speed }}×</span>
                  </div>

                  <div class="slider-row mb-5">
                    <span class="text-subtitle-2">{{ $t('projection.size') }}</span>
                    <v-slider
                      v-model="scale"
                      :min="AVATAR_SCALE_RANGE.min"
                      :max="AVATAR_SCALE_RANGE.max"
                      :step="5"
                      color="primary"
                      density="compact"
                      hide-details
                      thumb-size="14"
                      track-size="3"
                      class="slider-track"
                      data-testid="avatar-scale"
                    />
                    <span class="slider-value">{{ scale }}%</span>
                  </div>

                  <div class="slider-row mb-4">
                    <span class="text-subtitle-2">{{ $t('projection.position') }}</span>
                    <v-slider
                      v-model="position"
                      :min="AVATAR_POSITION_RANGE.min"
                      :max="AVATAR_POSITION_RANGE.max"
                      :step="AVATAR_POSITION_RANGE.step"
                      color="primary"
                      density="compact"
                      hide-details
                      thumb-size="14"
                      track-size="3"
                      class="slider-track"
                      data-testid="avatar-position"
                    />
                    <span class="slider-value">{{ position }}%</span>
                  </div>

                  <div class="toggle-stack">
                    <ToggleRow
                      :model-value="settings.autoInterpret"
                      :label="$t('projection.autoInterpret')"
                      data-testid="avatar-auto"
                      @update:model-value="change('autoInterpret', $event)"
                    />
                    <ToggleRow
                      :model-value="settings.stageShowSlide"
                      :label="$t('projection.showSlide')"
                      data-testid="stage-show-slide"
                      @update:model-value="change('stageShowSlide', $event)"
                    />
                  </div>
                </v-card-text>
              </v-expand-transition>
            </v-card>
          </div>
        </v-col>

        <v-col cols="12" lg="8" class="d-flex flex-column ga-5">
          <v-card :title="$t('projection.stage')">
            <template #prepend>
              <i class="card-icon-ph ph ph-presentation" />
            </template>
            <template #append>
              <v-chip
                :color="statusColor"
                size="small"
                label
                data-testid="avatar-status"
                :data-status="avatar.status"
              >
                <v-icon v-if="avatar.status === 'loading'" start class="mdi-spin" size="small">
                  mdi-loading
                </v-icon>
                {{ statusText }}
              </v-chip>
            </template>
            <v-card-text>
              <ProjectionStage :live-scale="scale" :live-position="position" />

              <v-alert
                v-if="avatar.status === 'unavailable'"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-4"
                data-testid="avatar-unavailable"
                :text="$t('projection.unavailableHint')"
              />
              <v-alert
                v-else-if="avatar.status === 'error'"
                type="error"
                variant="tonal"
                density="compact"
                class="mt-4"
                data-testid="avatar-error"
                :text="$t('projection.errorHint')"
              >
                <template #append>
                  <v-btn
                    size="small"
                    variant="text"
                    data-testid="avatar-retry"
                    @click="avatar.retry()"
                  >
                    {{ $t('projection.retry') }}
                  </v-btn>
                </template>
              </v-alert>
            </v-card-text>
          </v-card>

          <v-card :title="$t('projection.controls')" prepend-icon="mdi-tune">
            <v-card-text>
              <div>
                <h3 class="text-subtitle-1 font-weight-medium mb-2">
                  {{ $t('projection.sync.title') }}
                </h3>
                <SyncStatus />
              </div>

              <div class="mt-4">
                <h3 class="text-subtitle-1 font-weight-medium mb-2">
                  {{ $t('projection.signs') }}
                </h3>
                <SignProgress v-if="translation?.tokens.length" :tokens="translation.tokens" />
                <p v-else class="text-medium-emphasis">{{ $t('projection.noGloss') }}</p>
              </div>
            </v-card-text>
            <v-card-actions class="px-4 pb-4 ga-2">
              <v-btn
                color="primary"
                prepend-icon="mdi-play"
                :disabled="!avatar.ready"
                data-testid="avatar-play"
                @click="play"
              >
                {{ translation ? $t('projection.play') : $t('projection.test') }}
              </v-btn>
              <v-btn
                variant="tonal"
                :prepend-icon="avatar.paused ? 'mdi-play-pause' : 'mdi-pause'"
                :disabled="!avatar.ready || !avatar.playing"
                data-testid="avatar-pause"
                @click="togglePause()"
              >
                {{ avatar.paused ? $t('projection.resume') : $t('projection.pause') }}
              </v-btn>
              <v-btn
                variant="tonal"
                prepend-icon="mdi-stop"
                :disabled="!avatar.ready"
                data-testid="avatar-stop"
                @click="stop()"
              >
                {{ $t('projection.stop') }}
              </v-btn>
              <v-btn
                variant="tonal"
                prepend-icon="mdi-repeat"
                :disabled="!avatar.ready || !avatar.gloss"
                data-testid="avatar-repeat"
                @click="repeat()"
              >
                {{ $t('projection.repeat') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <v-card class="history-sidebar" :title="$t('slides.received')">
      <template #prepend>
        <i class="card-icon-ph ph ph-cards-three" />
      </template>

      <v-list bg-color="transparent" density="compact" data-testid="slides-history">
        <v-list-item
          v-for="slide in history"
          :key="keyOf(slide)"
          :active="slide === louvorja.currentSlide"
          :title="slide.text.split('\n')[0]"
          :subtitle="slide.title ?? $t(`slides.kinds.${slide.kind}`)"
        />
      </v-list>
    </v-card>
  </div>
</template>

<style scoped>
/* .page-container (main.scss) caps at 1100px and centres itself - on wider windows that leaves
   blank space to its right. "Slides recebidos" goes there, as a flex sibling, instead of sharing
   the already-used columns inside .page-container. */
.projection-layout {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

/* .page-container (main.scss) centres its max-width in the content area, which left this page's
   two columns floating with empty space to their own left instead of starting at the edge every
   other row of content already starts from (same fix as Configurações, SettingsView.vue). */
.page-container {
  flex: 0 1 1100px;
  margin-inline: 0;
}

.history-sidebar {
  flex: 1 1 260px;
  min-width: 260px;
  align-self: stretch;
}

.card-icon-ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-text-secondary);
  font-size: 22px;
}

/* "Ajustes" collapses: its header is the only clickable part (not the sliders/switches inside),
   with a chevron that flips to show the open state. */
.adjustments-toggle {
  cursor: pointer;
  user-select: none;
}

.adjustments-toggle:focus-visible {
  outline: none;
  background: var(--sidebar-hover);
}

.adjustments-chevron {
  transition: transform 0.2s ease;
}

.adjustments-chevron-open {
  transform: rotate(180deg);
}

/* Compact, inline style shared by "Velocidade" and "Adiantamento/Atraso": label, track and value
   share one row instead of the value sitting above a tall slider of its own. Wraps onto two
   lines (label, then track + value) when the label is too long to share the row ("Atraso para
   começar a interpretar" and the like). */
.slider-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.slider-track {
  flex: 1;
  min-width: 120px;
}

.slider-value {
  flex-shrink: 0;
  color: var(--accent-blue);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
}

/* "Interpretar automaticamente" and "Mostrar o slide ao fundo" use ToggleRow (see its own
   styles) instead of a Vuetify <v-switch>; this just stacks the two rows with a small gap. */
.toggle-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
