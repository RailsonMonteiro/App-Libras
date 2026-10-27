<script setup lang="ts">
// Icon from Flaticon's UIcons (see NOTICE.md for the required credit): "regular rounded", the
// same one used for the update notice elsewhere (AppNavbar.vue, SettingsDrawer.vue).
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
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
        <i class="dialog-icon-fi fi fi-rr-down-to-line" />
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
          v-if="updater.state.status !== 'downloaded'"
          color="primary"
          variant="tonal"
          :loading="updater.state.status === 'downloading'"
          :disabled="updater.state.status !== 'available'"
          data-testid="update-download"
          @click="updater.download()"
        >
          {{ $t('settings.updates.download') }}
        </v-btn>
        <v-btn
          v-else
          color="primary"
          variant="tonal"
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
.dialog-icon-fi {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  font-size: 22px;
}

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
