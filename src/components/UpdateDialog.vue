<script setup lang="ts">
import { computed } from 'vue'
import { useUpdaterStore } from '@/stores/updater.store'

const open = defineModel<boolean>({ required: true })
const updater = useUpdaterStore()

/** Release notes come from the GitHub release body - plain text, in case it carries HTML. */
const notes = computed(() => updater.state.releaseNotes?.replace(/<[^>]+>/g, '').trim() || '')
</script>

<template>
  <v-dialog v-model="open" max-width="480" data-testid="update-dialog">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="primary">mdi-cloud-download-outline</v-icon>
        {{ $t('settings.updates.available') }}
      </v-card-title>
      <v-card-subtitle v-if="updater.state.version">
        {{ $t('settings.updates.newVersion', { version: updater.state.version }) }}
      </v-card-subtitle>

      <v-card-text>
        <div class="text-subtitle-2 mb-1">{{ $t('settings.updates.whatsNew') }}</div>
        <p class="update-notes" data-testid="update-notes">
          {{ notes || $t('settings.updates.noNotes') }}
        </p>

        <v-progress-linear
          v-if="updater.state.status === 'downloading'"
          :model-value="updater.state.progressPercent ?? 0"
          color="primary"
          height="6"
          rounded
          class="mt-4"
        />
      </v-card-text>

      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="open = false">
          {{ $t('settings.close') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          :loading="updater.state.status === 'downloading'"
          :disabled="updater.state.status !== 'downloaded'"
          data-testid="update-now"
          @click="updater.install()"
        >
          {{ $t('settings.updates.updateNow') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.update-notes {
  max-height: 200px;
  margin: 0;
  overflow-y: auto;
  color: var(--sidebar-text-secondary);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
