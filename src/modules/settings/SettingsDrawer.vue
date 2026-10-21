<script setup lang="ts">
// Icons from Flaticon's UIcons (see NOTICE.md for the required credit): "regular rounded" (a
// semi-bold weight) for the "Atualizações" tab. Only this one family is loaded, not the full set.
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AboutView from '@/modules/about/AboutView.vue'
import ToggleRow from '@/components/ToggleRow.vue'
import { useAppStore } from '@/stores/app.store'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import LouvorJAView from '@/modules/louvorja/LouvorJAView.vue'
import { isHttpUrl } from '@/modules/libras/types/libras.types'
import OverlayPanel from '@/modules/overlay/components/OverlayPanel.vue'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUpdaterStore } from '@/stores/updater.store'
import LanguagePicker from './LanguagePicker.vue'
import SettingsSection from './SettingsSection.vue'
import UrlField from './UrlField.vue'
import ThemePicker from './ThemePicker.vue'
import {
  closeSettings,
  openSection,
  settingsOpen,
  SETTINGS_SECTION_ICONS,
  SETTINGS_SECTIONS,
  type SettingsSection as SettingsSectionName
} from './sections'
import type { AppSettings } from '@/types/settings'

/** Flaticon icons ("fi fi-...") are plain classes, not a Vuetify icon name for <v-icon>. */
const isFlaticon = (icon: string): boolean => icon.startsWith('fi ')

/** -1 for "no tab yet" (null), so the first real pick always slides in from the right. */
function sectionIndex(section: SettingsSectionName | null): number {
  return section === null ? -1 : SETTINGS_SECTIONS.indexOf(section)
}

/** Clicking the open tab again closes it, back to just the tab list. */
function toggleSection(name: SettingsSectionName): void {
  openSection.value = openSection.value === name ? null : name
}

// The content slides the way the tabs are laid out: forward to a tab further down, back to one
// above it. (Set before the drawer redraws, so the transition already knows the direction.)
const direction = ref<'forward' | 'back'>('forward')
watch(openSection, (now, before) => {
  direction.value = sectionIndex(now) >= sectionIndex(before) ? 'forward' : 'back'
})

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeSettings()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const { t } = useI18n()
const app = useAppStore()
const store = useSettingsStore()
const { settings } = storeToRefs(store)
const libras = useLibrasStore()
const avatar = useAvatarStore()
const updater = useUpdaterStore()
const { locale } = useI18n()
const error = ref('')

// The two service addresses are edited as text and saved when the field loses focus.
const translatorUrl = ref(settings.value.translatorUrl)
const signsIndexUrl = ref(settings.value.signsIndexUrl)
const dictionaryUrl = ref(settings.value.dictionaryUrl)
watch(
  () => [settings.value.translatorUrl, settings.value.signsIndexUrl, settings.value.dictionaryUrl],
  ([translator, signs, dictionary]) => {
    translatorUrl.value = translator!
    signsIndexUrl.value = signs!
    dictionaryUrl.value = dictionary!
  }
)

async function commitUrl(
  key: 'translatorUrl' | 'signsIndexUrl' | 'dictionaryUrl',
  value: string
): Promise<void> {
  const clean = value.trim()
  if (clean !== settings.value[key] && isHttpUrl(clean)) await change(key, clean)
}

const catalogInfo = computed(() => {
  const status = libras.catalog
  if (!status?.ready) return t('settings.libras.catalogEmpty')
  const date = status.updatedAt ? new Date(status.updatedAt).toLocaleDateString(locale.value) : '-'
  return t('settings.libras.catalogInfo', {
    count: status.count.toLocaleString(locale.value),
    date
  })
})

void avatar.refreshCacheStats().catch(() => undefined)

const cacheInfo = computed(() => {
  const { files, bytes } = avatar.cacheStats
  if (files === 0) return t('settings.avatar.cacheEmpty')
  const size = `${(bytes / 1_048_576).toLocaleString(locale.value, { maximumFractionDigits: 1 })} MB`
  return t('settings.avatar.cacheInfo', { count: files.toLocaleString(locale.value), size })
})

async function change<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  error.value = ''
  try {
    await store.update(key, value)
  } catch {
    error.value = t('settings.saveError')
  }
}
</script>

<template>
  <Transition name="settings-backdrop">
    <div
      v-if="settingsOpen"
      class="settings-backdrop"
      data-testid="settings-backdrop"
      @click="closeSettings()"
    />
  </Transition>

  <Transition name="settings-drawer">
    <aside
      v-if="settingsOpen"
      class="settings-drawer"
      :class="{ 'settings-drawer-expanded': openSection !== null }"
      data-testid="settings-drawer"
    >
      <nav class="settings-tabs" data-testid="settings-tabs">
        <button
          v-for="name in SETTINGS_SECTIONS"
          :key="name"
          type="button"
          class="settings-tab"
          :class="{ active: openSection === name }"
          :data-testid="`settings-tab-${name}`"
          @click="toggleSection(name)"
        >
          <i
            v-if="isFlaticon(SETTINGS_SECTION_ICONS[name])"
            class="settings-tab-icon-fi"
            :class="SETTINGS_SECTION_ICONS[name]"
          />
          <v-icon v-else size="20">{{ SETTINGS_SECTION_ICONS[name] }}</v-icon>
          <span>{{ $t(`settings.tabs.${name}`) }}</span>
        </button>

        <div class="settings-version" data-testid="settings-version">v{{ app.info?.version }}</div>
      </nav>

      <button
        type="button"
        class="settings-close"
        :title="$t('settings.close')"
        :aria-label="$t('settings.close')"
        data-testid="settings-close"
        @click="closeSettings()"
      >
        <v-icon size="20">mdi-close</v-icon>
      </button>

      <Transition :name="`settings-tab-${direction}`" mode="out-in">
        <div v-if="openSection !== null" :key="openSection" class="settings-content">
          <div v-if="openSection === 'general'" class="d-flex flex-column ga-5">
            <v-card :title="$t('settings.general')" prepend-icon="mdi-tune">
              <v-card-text>
                <v-alert v-if="error" type="error" class="mb-4" :text="error" />

                <div class="text-subtitle-2 mb-2">{{ $t('settings.language') }}</div>
                <LanguagePicker
                  class="mb-6"
                  :model-value="settings.locale"
                  @update:model-value="change('locale', $event)"
                />

                <div class="text-subtitle-2 mb-2">{{ $t('settings.theme') }}</div>
                <ThemePicker
                  class="mb-6"
                  :model-value="settings.theme"
                  @update:model-value="change('theme', $event)"
                />

                <div class="d-flex flex-column ga-2">
                  <ToggleRow
                    :model-value="settings.autoConnect"
                    :label="$t('settings.autoConnect')"
                    data-testid="setting-auto-connect"
                    @update:model-value="change('autoConnect', $event)"
                  />
                  <ToggleRow
                    :model-value="settings.runInBackground"
                    :label="$t('settings.runInBackground')"
                    :hint="$t('settings.runInBackgroundHint')"
                    data-testid="setting-run-in-background"
                    @update:model-value="change('runInBackground', $event)"
                  />
                </div>
              </v-card-text>
            </v-card>
          </div>

          <LouvorJAView v-else-if="openSection === 'connection'" />

          <div v-else-if="openSection === 'translator'" class="d-flex flex-column ga-5">
            <SettingsSection
              icon="mdi-translate"
              :title="$t('settings.libras.sections.online.title')"
              :description="$t('settings.libras.onlineHint')"
            >
              <ToggleRow
                :model-value="settings.onlineTranslator"
                :label="$t('settings.libras.online')"
                data-testid="setting-online-translator"
                @update:model-value="change('onlineTranslator', $event)"
              />

              <UrlField
                v-model="translatorUrl"
                :label="$t('settings.libras.translatorUrl')"
                :error="isHttpUrl(translatorUrl) ? '' : $t('settings.libras.invalidUrl')"
                data-testid="setting-translator-url"
                @commit="commitUrl('translatorUrl', translatorUrl)"
              />
            </SettingsSection>

            <SettingsSection
              icon="mdi-book-open-variant"
              :title="$t('settings.libras.catalog')"
              :description="$t('settings.libras.sections.catalog.description')"
            >
              <UrlField
                v-model="signsIndexUrl"
                :label="$t('settings.libras.signsIndexUrl')"
                :error="isHttpUrl(signsIndexUrl) ? '' : $t('settings.libras.invalidUrl')"
                data-testid="setting-signs-url"
                @commit="commitUrl('signsIndexUrl', signsIndexUrl)"
              />

              <div class="status-row">
                <v-icon :color="libras.catalog?.ready ? 'success' : 'warning'" size="22">
                  {{ libras.catalog?.ready ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
                </v-icon>
                <div class="status-text" data-testid="catalog-info">{{ catalogInfo }}</div>
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-download"
                  :loading="libras.catalogBusy"
                  data-testid="catalog-refresh"
                  @click="libras.refreshCatalog()"
                >
                  {{ $t('settings.libras.refresh') }}
                </v-btn>
              </div>
              <v-alert
                v-if="libras.catalogError"
                type="error"
                variant="tonal"
                density="compact"
                data-testid="catalog-error"
                :text="$t('settings.libras.refreshError')"
              />
            </SettingsSection>

            <SettingsSection
              icon="mdi-database-outline"
              :title="$t('settings.libras.sections.dictionary.title')"
              :description="$t('settings.libras.sections.dictionary.description')"
            >
              <UrlField
                v-model="dictionaryUrl"
                :label="$t('settings.avatar.dictionaryUrl')"
                :error="isHttpUrl(dictionaryUrl) ? '' : $t('settings.libras.invalidUrl')"
                data-testid="setting-dictionary-url"
                @commit="commitUrl('dictionaryUrl', dictionaryUrl)"
              />

              <div class="status-row">
                <v-icon color="primary" size="22">mdi-content-save-outline</v-icon>
                <div class="status-text">
                  <div class="text-caption text-medium-emphasis">
                    {{ $t('settings.avatar.cache') }}
                  </div>
                  <div data-testid="avatar-cache-info">{{ cacheInfo }}</div>
                </div>
                <v-btn
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-delete-outline"
                  :disabled="avatar.cacheStats.files === 0"
                  data-testid="avatar-cache-clear"
                  @click="avatar.clearCache()"
                >
                  {{ $t('settings.avatar.clear') }}
                </v-btn>
              </div>
            </SettingsSection>
          </div>

          <div v-else-if="openSection === 'updates'" class="d-flex flex-column ga-5">
            <SettingsSection
              icon="fi fi-rr-down-to-line"
              :title="$t('settings.updates.title')"
              :description="$t('settings.updates.description')"
            >
              <v-btn
                color="primary"
                variant="tonal"
                :loading="updater.checking"
                data-testid="settings-check-updates"
                @click="updater.check()"
              >
                <i class="btn-icon-fi fi fi-rr-down-to-line" />
                {{ $t('settings.updates.check') }}
              </v-btn>

              <p
                v-if="updater.state.status !== 'idle'"
                class="update-status"
                data-testid="settings-updates-status"
                :data-status="updater.state.status"
              >
                <v-icon size="16" class="mr-1">
                  {{
                    updater.state.status === 'error'
                      ? 'mdi-alert-circle-outline'
                      : 'mdi-information-outline'
                  }}
                </v-icon>
                <template v-if="updater.state.status === 'checking'">
                  {{ $t('settings.updates.checking') }}
                </template>
                <template v-else-if="updater.state.status === 'downloading'">
                  {{
                    $t('settings.updates.downloading', {
                      percent: updater.state.progressPercent ?? 0
                    })
                  }}
                </template>
                <template v-else-if="updater.state.status === 'downloaded'">
                  {{ $t('settings.updates.downloaded', { version: updater.state.version ?? '' }) }}
                </template>
                <template v-else-if="updater.state.status === 'upToDate'">
                  {{ $t('settings.updates.upToDate') }}
                </template>
                <template v-else-if="updater.state.status === 'error'">
                  {{ $t('settings.updates.error') }}
                </template>
                <template v-else>
                  {{ $t('settings.updates.unavailable') }}
                </template>
              </p>
              <v-progress-linear
                v-if="updater.state.status === 'downloading'"
                :model-value="updater.state.progressPercent ?? 0"
                color="primary"
                height="6"
                rounded
                class="mt-2"
              />
              <v-btn
                v-if="updater.state.status === 'downloaded'"
                color="primary"
                variant="tonal"
                prepend-icon="mdi-restart"
                block
                class="mt-3"
                data-testid="settings-install-update"
                @click="updater.install()"
              >
                {{ $t('settings.updates.install') }}
              </v-btn>
            </SettingsSection>
          </div>

          <AboutView v-else-if="openSection === 'about'" />

          <OverlayPanel v-else-if="openSection === 'overlay'" />
        </div>
      </Transition>
    </aside>
  </Transition>
</template>

<style scoped>
/* v-btn's own "prepend-icon" prop only takes a Vuetify icon name, not a Flaticon class - the
   same spacing by hand (v-btn's default icon-to-text gap), on a plain <i>. */
.btn-icon-fi {
  margin-right: 8px;
  font-size: 18px;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.35);
}

.settings-backdrop-enter-active,
.settings-backdrop-leave-active {
  transition: opacity 0.2s ease;
}

.settings-backdrop-enter-from,
.settings-backdrop-leave-to {
  opacity: 0;
}

/* Below the backdrop's own full-screen overlay color, above everything else in the app
   (including the navbar, 9999) - it floats over the current page, not inside it. Narrow at
   first - just the tab list (plus room for the close button) - and only grows once a tab is
   picked and there is actual content to show next to it. */
.settings-drawer {
  position: fixed;
  top: calc(var(--titlebar-height) + var(--navbar-height));
  bottom: 0;
  left: 0;
  z-index: 10001;
  display: flex;
  overflow: hidden;
  width: 248px;
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
  background: var(--main-bg);
  box-shadow: 6px 0 28px rgba(0, 0, 0, 0.25);
  transition: width 0.22s ease;
}

.settings-drawer-expanded {
  width: min(820px, 100vw);
}

.settings-drawer-enter-active,
.settings-drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-drawer-enter-from,
.settings-drawer-leave-to {
  transform: translateX(-100%);
}

.settings-tabs {
  display: flex;
  flex: 0 0 200px;
  flex-direction: column;
  gap: 2px;
  padding: 20px 8px;
  overflow-y: auto;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--border-radius);
  background: none;
  color: var(--sidebar-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
  transition: var(--transition);
}

/* The Flaticon icon is a plain <i>, not Vuetify's <v-icon>: match its size and centre it the
   same way by hand. */
.settings-tab-icon-fi {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

/* Pinned to the bottom of the tab list by the column's own flex (not a fixed/absolute position),
   so it always sits right after the last tab regardless of how tall the drawer is. */
.settings-version {
  margin-top: auto;
  padding: 10px 12px 4px;
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

.settings-tab .v-icon {
  color: var(--sidebar-text);
  transition: var(--transition);
}

.settings-tab:hover {
  background: var(--sidebar-hover);
}

.settings-tab.active {
  background: var(--sidebar-hover);
  color: var(--accent-blue);
}

.settings-tab.active .v-icon {
  color: var(--accent-blue);
}

.settings-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--sidebar-text-secondary);
  cursor: pointer;
  transition: var(--transition);
}

.settings-close:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text);
}

.settings-content {
  flex: 1;
  min-width: 0;
  padding: 56px 28px 28px;
  overflow-y: auto;
}

/* One line of state with its action on the right: what is there now, and a button to change it. */
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
}

.status-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.update-status {
  display: flex;
  align-items: center;
  margin: 14px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
}

.update-status[data-status='error'] {
  color: rgb(var(--v-theme-error));
}

/* A short slide and fade when the tab changes; nothing moves for people who ask for less motion. */
.settings-tab-forward-enter-active,
.settings-tab-forward-leave-active,
.settings-tab-back-enter-active,
.settings-tab-back-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.settings-tab-forward-enter-from,
.settings-tab-back-leave-to {
  opacity: 0;
  transform: translateX(28px);
}

.settings-tab-forward-leave-to,
.settings-tab-back-enter-from {
  opacity: 0;
  transform: translateX(-28px);
}

@media (prefers-reduced-motion: reduce) {
  .settings-drawer-enter-active,
  .settings-drawer-leave-active,
  .settings-tab-forward-enter-active,
  .settings-tab-forward-leave-active,
  .settings-tab-back-enter-active,
  .settings-tab-back-leave-active {
    transition: opacity 0.2s ease;
  }

  .settings-drawer-enter-from,
  .settings-drawer-leave-to {
    transform: none;
  }

  .settings-tab-forward-enter-from,
  .settings-tab-forward-leave-to,
  .settings-tab-back-enter-from,
  .settings-tab-back-leave-to {
    transform: none;
  }
}
</style>
