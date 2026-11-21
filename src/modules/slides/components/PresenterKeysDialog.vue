<script setup lang="ts">
// "Iniciar"/"Finalizar"/"Voltar"/"Avançar": the same Phosphor icons as the buttons they bind.
import '@phosphor-icons/web/regular/style.css'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PowerPointService } from '@/modules/powerpoint/services/PowerPointService'
import { acceleratorFor } from '@/modules/powerpoint/types/presenterKeys'
import { useSettingsStore } from '@/stores/settings.store'
import type { RemoteKey } from '@/types/ipc'
import {
  DEFAULT_PRESENTER_KEYS,
  PRESENTER_ACTIONS,
  PRESENTER_END_KEY,
  type PresenterAction,
  type PresenterKeys
} from '@/types/settings'

const open = defineModel<boolean>({ required: true })
const settingsStore = useSettingsStore()
const { t } = useI18n()

const keys = computed(() => settingsStore.settings.presenterKeys)
const device = computed(() => settingsStore.settings.presenterDevice)
/** What the next button pressed is for: an action's key, or just identifying the remote. */
const listening = ref<PresenterAction | 'device' | null>(null)

const ICONS: Record<PresenterAction, string> = {
  start: 'ph-airplay',
  end: 'ph-stop',
  previous: 'ph-skip-back',
  next: 'ph-skip-forward'
}
const LABELS: Record<PresenterAction, string> = {
  start: 'slides.startPresentation',
  end: 'slides.endPresentation',
  previous: 'slides.previous',
  next: 'slides.next'
}
const KEY_LABELS: Record<string, string> = {
  Left: '←',
  Right: '→',
  Up: '↑',
  Down: '↓'
}

function keyLabel(key: string | null): string {
  if (key === null) return t('slides.presenter.none')
  // Bindings saved by older versions used `KeyboardEvent.key` names ("ArrowRight", " ").
  const name = acceleratorFor(key) ?? key
  if (name === 'Space') return t('slides.presenter.space')
  return KEY_LABELS[name] ?? name
}

/** "VID_1234&PID_5678" -> "1234:5678"; a device without those ids shows only the end of its name. */
function deviceLabel(id: string): string {
  const match = /VID_([0-9A-F]+)&PID_([0-9A-F]+)/.exec(id)
  if (match) return `${match[1]}:${match[2]}`
  return id.length > 18 ? `…${id.slice(-17)}` : id || '?'
}

function save(next: PresenterKeys): void {
  void settingsStore.update('presenterKeys', next)
}

/** The key pressed while listening, from whichever device - reported by the main process (it
 *  knows the device, this window does not), even with another window in front. */
function onRemoteKey({ device: pressedOn, key }: RemoteKey): void {
  const target = listening.value
  if (!target) return
  // Esc is reserved: it always ends the presentation (see PRESENTER_END_KEY), so it can't be
  // bound to anything else - and binding it to "Finalizar" would add nothing. Here it cancels.
  if (key === PRESENTER_END_KEY) {
    listening.value = null
    return
  }
  listening.value = null
  if (pressedOn !== device.value) void settingsStore.update('presenterDevice', pressedOn)
  if (target === 'device') return

  // One key, one action: taking it from whichever action had it before.
  const next = { ...keys.value }
  for (const other of PRESENTER_ACTIONS) {
    if (next[other] !== null && (acceleratorFor(next[other]) ?? next[other]) === key) {
      next[other] = null
    }
  }
  next[target] = key
  save(next)
}

/** Keeps the key being bound from also acting on this dialog (Esc closing it, Enter/Space
 *  clicking a button) when the person presses it on the keyboard. */
function onCapture(event: KeyboardEvent): void {
  if (!listening.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === PRESENTER_END_KEY) listening.value = null
}

function listen(target: PresenterAction | 'device'): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  listening.value = target
}

function clear(action: PresenterAction): void {
  save({ ...keys.value, [action]: null })
}

let stopRemoteKeys: (() => void) | null = null
watch(listening, (target) => {
  if (target) window.addEventListener('keydown', onCapture, true)
  else window.removeEventListener('keydown', onCapture, true)
})
// While open, keys are reported here (from every device) instead of driving the slide show.
// Never lets a failure here (e.g. the main process not answering) keep the dialog from opening.
watch(open, (isOpen) => {
  try {
    if (isOpen) {
      stopRemoteKeys ??= PowerPointService.onRemoteKey(onRemoteKey)
    } else {
      listening.value = null
      stopRemoteKeys?.()
      stopRemoteKeys = null
    }
    PowerPointService.bindRemote(isOpen).catch((error) => console.warn(error))
  } catch (error) {
    console.warn(error)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onCapture, true)
  stopRemoteKeys?.()
  if (open.value) PowerPointService.bindRemote(false).catch(() => undefined)
})
</script>

<template>
  <v-dialog v-model="open" max-width="420" data-testid="presenter-keys-dialog">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon size="20">mdi-remote</v-icon>
        {{ $t('slides.presenter.title') }}
      </v-card-title>
      <v-card-subtitle class="dialog-hint">{{ $t('slides.presenter.hint') }}</v-card-subtitle>

      <v-card-text>
        <div class="binding-row device-row" data-testid="presenter-device">
          <v-icon size="18">mdi-remote</v-icon>
          <span class="binding-label">
            {{ $t('slides.presenter.device') }}
            <span class="binding-note">{{ $t('slides.presenter.deviceHint') }}</span>
          </span>
          <v-btn
            size="small"
            variant="tonal"
            :color="listening === 'device' ? 'primary' : undefined"
            class="binding-key"
            :title="device ?? ''"
            data-testid="presenter-device-identify"
            @click="listen('device')"
          >
            {{
              listening === 'device'
                ? $t('slides.presenter.pressAny')
                : device
                  ? deviceLabel(device)
                  : $t('slides.presenter.identify')
            }}
          </v-btn>
          <v-btn
            icon
            size="x-small"
            variant="text"
            :disabled="device === null"
            :aria-label="$t('slides.presenter.unlinkDevice')"
            @click="settingsStore.update('presenterDevice', null)"
          >
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>
        </div>
        <p v-if="device === null" class="binding-warning" data-testid="presenter-no-device">
          {{ $t('slides.presenter.noDevice') }}
        </p>
        <v-divider class="my-2" />

        <div v-for="action in PRESENTER_ACTIONS" :key="action" class="binding-row">
          <i class="binding-icon ph" :class="ICONS[action]" />
          <span class="binding-label">
            {{ $t(LABELS[action]) }}
            <span v-if="action === 'end'" class="binding-note">
              {{ $t('slides.presenter.escAlways') }}
            </span>
          </span>
          <v-btn
            size="small"
            variant="tonal"
            :color="listening === action ? 'primary' : undefined"
            class="binding-key"
            :data-testid="`presenter-key-${action}`"
            @click="listen(action)"
          >
            {{ listening === action ? $t('slides.presenter.pressKey') : keyLabel(keys[action]) }}
          </v-btn>
          <v-btn
            icon
            size="x-small"
            variant="text"
            :disabled="keys[action] === null"
            :aria-label="$t('slides.presenter.clear')"
            @click="clear(action)"
          >
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" @click="save({ ...DEFAULT_PRESENTER_KEYS })">
          {{ $t('slides.presenter.restore') }}
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ $t('settings.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-hint {
  white-space: normal;
}

.binding-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.binding-icon {
  font-size: 18px;
}

.binding-label {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.binding-note {
  color: var(--sidebar-text-secondary);
  font-size: 11px;
}

.binding-warning {
  margin: 0 0 4px;
  color: rgb(var(--v-theme-warning));
  font-size: 12px;
}

/* Fixed width so the row doesn't jump between "Nenhuma", "PageDown" and "Aperte uma tecla…". */
.binding-key {
  min-width: 140px;
  text-transform: none;
}
</style>
