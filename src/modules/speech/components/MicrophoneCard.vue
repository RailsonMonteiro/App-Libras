<script setup lang="ts">
// "Microfone": one Phosphor glyph, "regular" family - already loaded by the projection page.
import { computed } from 'vue'
import { useSpeechStore } from '../stores/speech.store'

/**
 * Turns the microphone on and off: while on, what is said is recognized by Windows and signed by
 * the avatar, phrase by phrase - ahead of LouvorJA and PowerPoint (see useActivePresentationSource).
 */
const speech = useSpeechStore()

const lastPhrase = computed(() => speech.currentSlide?.text ?? '')

function toggle(): void {
  void (speech.active ? speech.stop() : speech.start())
}
</script>

<template>
  <v-card :title="$t('speech.title')" data-testid="microphone-card">
    <template #prepend>
      <i class="card-icon-ph ph ph-microphone" />
    </template>
    <template #append>
      <v-chip
        v-if="speech.status === 'listening'"
        color="error"
        size="small"
        label
        data-testid="microphone-live"
      >
        <v-icon start size="small">mdi-circle</v-icon>{{ $t('speech.listening') }}
      </v-chip>
    </template>

    <v-card-text class="d-flex flex-column ga-3">
      <p class="hint">{{ $t('speech.hint') }}</p>

      <v-btn
        :color="speech.active ? 'error' : 'primary'"
        :variant="speech.active ? 'tonal' : 'flat'"
        :loading="speech.status === 'starting'"
        block
        data-testid="microphone-toggle"
        @click="toggle"
      >
        <v-icon start>{{ speech.active ? 'mdi-microphone-off' : 'mdi-microphone' }}</v-icon>
        {{ speech.active ? $t('speech.stop') : $t('speech.start') }}
      </v-btn>

      <v-alert
        v-if="speech.status === 'error' && speech.error"
        type="warning"
        variant="tonal"
        density="compact"
        data-testid="microphone-error"
      >
        <div>{{ $t(`speech.errors.${speech.error.code}`) }}</div>
        <div v-if="speech.error.code === 'other' && speech.error.message" class="error-detail">
          {{ speech.error.message }}
        </div>
        <v-btn
          v-if="speech.error.code !== 'other'"
          size="small"
          variant="text"
          class="mt-1 px-0"
          @click="speech.openSettings(speech.error.code)"
        >
          {{ $t('speech.openSettings') }}
        </v-btn>
      </v-alert>

      <div v-if="speech.status === 'listening'" class="last-phrase" data-testid="microphone-last">
        <span class="label">{{ $t('speech.lastPhrase') }}</span>
        <span>{{ lastPhrase || $t('speech.waiting') }}</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.error-detail {
  font-size: 12px;
  opacity: 0.8;
}

.last-phrase {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
}

.last-phrase .label {
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

.card-icon-ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-text-secondary);
  font-size: 22px;
}
</style>
