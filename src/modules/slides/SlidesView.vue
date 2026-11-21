<script setup lang="ts">
// This page is dedicated to PowerPoint only (link one of the presentations open in PowerPoint,
// drive its slide show, see the live slide and its translation). The "Próximos slides" sidebar below previews what is coming up next in the
// loaded file - it has no link to LouvorJA's own "Slides recebidos" card on the Projeção page,
// which is a history of what already aired.
// "Voltar"/"Avançar": one icon from Phosphor Icons' web font, "regular" weight only.
import '@phosphor-icons/web/regular/style.css'
import { computed, onMounted, ref, watch } from 'vue'
import SlidePreview from '@/components/SlidePreview.vue'
import GlossView from '@/modules/libras/components/GlossView.vue'
import { usePowerPointStore } from '@/modules/powerpoint/stores/powerpoint.store'
import { slideImageUrl } from '@/modules/powerpoint/types/powerpoint.types'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import type { OpenPresentation } from '@/types/ipc'
import PresenterKeysDialog from './components/PresenterKeysDialog.vue'

const store = usePowerPointStore()

const presenterKeysOpen = ref(false)

/** What PowerPoint has open, plus the linked one even after it was closed there - otherwise the
 *  field would show its raw path instead of its name. */
const presentationItems = computed<OpenPresentation[]>(() => {
  const items = store.openPresentations
  const linked = store.linkedPath
  if (!linked || items.some((item) => item.path === linked)) return items
  return [...items, { path: linked, name: linked.split(/[\\/]/).pop() || linked }]
})

onMounted(() => void store.refreshOpen())

/** A real thumbnail of the current slide (rendered from the .pptx file itself - see
 *  PowerPointSlideImageCache), with the text-only SlidePreview as a fallback - rendering can
 *  fail for reasons out of our control (an unsupported font, an unusual file) and this page must
 *  still show something either way. */
const currentImageUrl = computed(() =>
  store.presentation && store.currentSlide
    ? slideImageUrl(store.presentation.id, (store.currentSlide.index ?? 0) + 1)
    : null
)
const currentImageFailed = ref(false)
/** Rendering a slide can take a few seconds (or longer, for a heavy file) - without this, a
 *  slide that is still loading looked identical to one that had already failed (both just a
 *  black box), which is exactly what confused testing earlier. */
const currentImageLoaded = ref(false)
watch(
  () => `${store.presentation?.id ?? ''}#${store.currentSlide?.index ?? ''}`,
  () => {
    currentImageFailed.value = false
    currentImageLoaded.value = false
  }
)

/** Same idea for each "Próximos slides" thumbnail - tracked by index since there is no other
 *  stable identity for a slide that has not arrived as an event yet. */
const failedUpcoming = ref(new Set<number>())
const loadedUpcoming = ref(new Set<number>())
watch(
  () => store.presentation?.id,
  () => {
    failedUpcoming.value = new Set()
    loadedUpcoming.value = new Set()
  }
)
function upcomingImageUrl(index: number): string | null {
  return store.presentation ? slideImageUrl(store.presentation.id, index + 1) : null
}
</script>

<template>
  <div class="slides-layout">
    <div class="page-container">
      <v-row>
        <v-col cols="12" md="3">
          <SettingsSection
            icon="mdi-gamepad-variant-outline"
            :title="$t('slides.navigation')"
            data-testid="slides-navigation"
          >
            <div class="file-field" :title="store.linkedPath ?? ''">
              <v-select
                :model-value="store.linkedPath"
                :items="presentationItems"
                item-title="name"
                item-value="path"
                :placeholder="$t('slides.selectPresentation')"
                :no-data-text="$t('slides.noOpenPresentations')"
                :loading="store.loadingOpen"
                class="flex-grow-1"
                variant="solo-filled"
                flat
                density="comfortable"
                hide-details
                :menu-props="{ minWidth: 320, maxWidth: 480 }"
                data-testid="slides-linked-presentation"
                @update:menu="(isOpen: boolean) => isOpen && store.refreshOpen()"
                @update:model-value="(path: string | null) => path && store.link(path)"
              >
                <template #prepend-inner>
                  <v-icon size="20">mdi-file-powerpoint-box-outline</v-icon>
                </template>
                <template #item="{ props: itemProps, item }">
                  <v-list-item
                    v-bind="itemProps"
                    :title="item.raw.name"
                    :subtitle="item.raw.path"
                  />
                </template>
              </v-select>
            </div>

            <div v-if="store.ocr" class="ocr-progress" data-testid="slides-ocr-progress">
              <span>
                {{ $t('slides.ocrProgress', { done: store.ocr.done, total: store.ocr.total }) }}
              </span>
              <v-progress-linear
                :model-value="(store.ocr.done / Math.max(store.ocr.total, 1)) * 100"
                color="primary"
                height="3"
                rounded
              />
            </div>

            <p v-if="store.linkError" class="link-error" data-testid="slides-link-error">
              <v-icon size="14" class="mr-1">mdi-alert-circle-outline</v-icon>
              {{ $t('slides.linkError') }}
            </p>

            <div class="control-header">
              <v-btn
                icon
                size="x-small"
                variant="text"
                :loading="store.loadingOpen"
                :aria-label="$t('slides.refreshOpen')"
                data-testid="slides-refresh-open"
                @click="store.refreshOpen()"
              >
                <v-icon size="16">mdi-refresh</v-icon>
                <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                  {{ $t('slides.refreshOpen') }}
                </v-tooltip>
              </v-btn>
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="$t('slides.presenter.open')"
                data-testid="slides-presenter-settings"
                @click="presenterKeysOpen = true"
              >
                <v-icon size="16">mdi-cog-outline</v-icon>
                <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                  {{ $t('slides.presenter.open') }}
                </v-tooltip>
              </v-btn>
            </div>

            <div class="control-group">
              <div class="control-row">
                <v-btn
                  variant="text"
                  class="control-btn"
                  :aria-label="$t('slides.startPresentation')"
                  data-testid="slides-start-presentation"
                  @click="store.control('start')"
                >
                  <i class="control-icon ph ph-airplay" />
                  <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                    {{ $t('slides.startPresentation') }}
                  </v-tooltip>
                </v-btn>
                <v-btn
                  variant="text"
                  class="control-btn"
                  :aria-label="$t('slides.endPresentation')"
                  data-testid="slides-end-presentation"
                  @click="store.control('end')"
                >
                  <i class="control-icon ph ph-stop" />
                  <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                    {{ $t('slides.endPresentation') }}
                  </v-tooltip>
                </v-btn>
              </div>

              <div class="control-row">
                <v-btn
                  variant="text"
                  class="control-btn"
                  :aria-label="$t('slides.previous')"
                  data-testid="slides-nav-previous"
                  @click="store.control('previous')"
                >
                  <i class="control-icon ph ph-skip-back" />
                  <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                    {{ $t('slides.previous') }}
                  </v-tooltip>
                </v-btn>
                <v-btn
                  variant="text"
                  class="control-btn"
                  :aria-label="$t('slides.next')"
                  data-testid="slides-nav-next"
                  @click="store.control('next')"
                >
                  <i class="control-icon ph ph-skip-forward" />
                  <v-tooltip activator="parent" location="top" content-class="control-tooltip">
                    {{ $t('slides.next') }}
                  </v-tooltip>
                </v-btn>
              </div>
            </div>
          </SettingsSection>
          <PresenterKeysDialog v-model="presenterKeysOpen" />
        </v-col>

        <v-col cols="12" md="9">
          <v-card :title="$t('slides.current')" prepend-icon="mdi-presentation">
            <template #append>
              <v-chip color="error" size="small" label data-testid="live-chip">
                <v-icon start size="small">mdi-circle</v-icon>{{ $t('slides.live') }}
              </v-chip>
            </template>
            <v-card-text>
              <div class="slide-image-wrap">
                <img
                  v-if="currentImageUrl && !currentImageFailed"
                  :src="currentImageUrl"
                  class="slide-image"
                  alt=""
                  data-testid="slides-current-image"
                  @load="currentImageLoaded = true"
                  @error="currentImageFailed = true"
                />
                <SlidePreview v-else :slide="store.currentSlide" test-id="slides-current" />
                <div
                  v-if="currentImageUrl && !currentImageFailed && !currentImageLoaded"
                  class="slide-image-loading"
                  data-testid="slides-current-loading"
                >
                  <v-progress-circular indeterminate color="white" size="28" width="3" />
                </div>
              </div>
              <p class="text-medium-emphasis mt-3 mb-0">
                <span v-if="store.presentation">
                  {{
                    $t('slides.presentation', {
                      title: store.presentation.title || $t('slides.untitled')
                    })
                  }}
                </span>
                <span v-else>{{ $t('slides.noPresentation') }}</span>
                <template v-if="store.currentSlide?.index !== null && store.currentSlide?.total">
                  ·
                  {{
                    $t('slides.position', {
                      n: (store.currentSlide?.index ?? 0) + 1,
                      total: store.currentSlide?.total
                    })
                  }}
                </template>
                <template v-if="store.currentSlide">
                  · {{ $t(`slides.kinds.${store.currentSlide.kind}`) }}
                </template>
              </p>
            </v-card-text>
          </v-card>

          <v-card class="mt-6" data-testid="gloss-card">
            <v-card-text>
              <GlossView :text="store.currentSlide?.text ?? ''" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <v-card
      class="upcoming-sidebar"
      :title="$t('slides.upcoming')"
      data-testid="slides-upcoming-card"
    >
      <template #prepend>
        <i class="ph ph-cards-three card-icon-ph" />
      </template>
      <v-card-text v-if="!store.upcomingSlides.length" class="text-medium-emphasis">
        {{ $t('slides.noUpcoming') }}
      </v-card-text>
      <v-list v-else bg-color="transparent" density="compact" data-testid="slides-upcoming">
        <v-list-item
          v-for="upcomingSlide in store.upcomingSlides"
          :key="upcomingSlide.index"
          data-testid="slide-upcoming-item"
          :title="upcomingSlide.text.split('\n')[0] || $t('slides.untitled')"
          :subtitle="
            store.currentSlide?.total
              ? $t('slides.position', {
                  n: upcomingSlide.index + 1,
                  total: store.currentSlide.total
                })
              : undefined
          "
        >
          <template #prepend>
            <div v-if="!failedUpcoming.has(upcomingSlide.index)" class="upcoming-thumb-wrap">
              <img
                :src="upcomingImageUrl(upcomingSlide.index)!"
                class="upcoming-thumb"
                loading="lazy"
                alt=""
                data-testid="slide-upcoming-image"
                @load="loadedUpcoming.add(upcomingSlide.index)"
                @error="failedUpcoming.add(upcomingSlide.index)"
              />
              <v-progress-circular
                v-if="!loadedUpcoming.has(upcomingSlide.index)"
                indeterminate
                color="white"
                size="14"
                width="2"
                class="upcoming-thumb-loading"
              />
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<style scoped>
/* .page-container (main.scss) caps at 1100px and centres itself - on wider windows that leaves
   blank space to its right. "Próximos slides" goes there, as a flex sibling, instead of sharing
   the already-used columns inside .page-container (same layout as ProjectionView.vue). */
.slides-layout {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  height: 100%;
}

/* .page-container (main.scss) centres its max-width in the content area, which left this page's
   card floating with empty space to its own left instead of starting at the edge every other row
   of content already starts from (same fix as Configurações/Projeção). */
.page-container {
  flex: 0 1 1100px;
  margin-inline: 0;
}

/* Caps at the visible height (not at its sibling's, which can grow past the screen) and keeps
   that height even once there are more slides than fit: the list inside scrolls on its own
   instead of growing the card (and overflowing to the page's own outer scrollbar). */
.upcoming-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1 1 260px;
  min-width: 260px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.upcoming-sidebar :deep(.v-list) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.slide-image-wrap {
  position: relative;
}

/* Centered over the image/preview while rendering hasn't finished yet - without this, "still
   loading" and "failed" looked identical (both just a black box). */
.slide-image-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Same box (16:9, black, rounded) as SlidePreview's own .slide-preview, so swapping between the
   two - a real thumbnail vs. the text-only fallback - never shifts the layout. */
.slide-image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--border-radius);
  background: #000;
  object-fit: contain;
}

.upcoming-thumb-wrap {
  position: relative;
  width: 56px;
  aspect-ratio: 16 / 9;
}

.upcoming-thumb-loading {
  position: absolute;
  inset: 0;
  margin: auto;
}

/* The small thumbnail next to each "Próximos slides" row. */
.upcoming-thumb {
  width: 56px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 4px;
  background: #000;
}

/* The presentations open in PowerPoint (pick one to link it) - the whole width of the column, so
   the file name is not cut down to a few letters. */
.file-field {
  display: flex;
  min-width: 0;
  margin-bottom: 8px;
}

.file-field :deep(.v-select__selection) {
  min-width: 0;
}

.file-field :deep(.v-select__selection-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* "Lendo o texto das imagens…" while slides made of a picture are read (OCR). */
.ocr-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

.link-error {
  display: flex;
  align-items: center;
  margin: 0 0 8px;
  color: rgb(var(--v-theme-error));
  font-size: 12px;
}

/* Small buttons above the controls: refresh the open presentations, and the gear that opens the
   presenter remote ("passador") key bindings. */
.control-header {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin-bottom: 2px;
}

/* Iniciar/Finalizar on top, Voltar/Avançar side by side below it - one taller outline
   around both rows instead of just the navigation pair (same family look as
   Interpretar/Parar/Repetir in ProjectionView.vue, just not seamless). */
.control-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.control-row {
  display: inline-flex;
  gap: 28px;
}

/* A background to actually cast the shadow against - "text" variant alone is transparent,
   which would make a box-shadow invisible. */
.control-btn {
  border-radius: 8px !important;
  background: var(--card-bg) !important;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.18),
    0 1px 2px rgba(0, 0, 0, 0.12) !important;
}

.control-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
}

.card-icon-ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-text-secondary);
  font-size: 22px;
}

/* content-class puts this class on the same element as .v-overlay__content (teleported to
   <body>, outside this component's scoped styles) - not on a wrapper around it, hence the
   combined selector and !important to beat Vuetify's own tooltip padding/radius rule. */
:global(.v-overlay__content.control-tooltip) {
  min-width: 0 !important;
  padding: 2px 8px !important;
  border-radius: 999px !important;
  font-size: 11px !important;
  line-height: 1.6 !important;
}
</style>
