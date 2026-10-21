<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import louvorjaLogoUrl from '@/assets/images/louvorja-logo.png'
import violinLogoUrl from '@/assets/images/violin-logo.svg'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import ConnectionForm from './components/ConnectionForm.vue'
import ConnectionInfoCard from './components/ConnectionInfoCard.vue'
import ConnectionStateChip from './components/ConnectionStateChip.vue'
import ConnectionStatus from './components/ConnectionStatus.vue'
import { useLouvorJAStore } from './stores/louvorja.store'
import type { ServerInfo } from './types/louvorja.types'

const store = useLouvorJAStore()

/** Each program's own mark where there is one (LouvorJA and Violin use their real logos instead
 *  of a generic icon); Flute doesn't have one of its own borrowed into this project, so it keeps
 *  the original LouvorJA's icon (same family of programs). Piano has no logo of its own either. */
const ICON: Record<ServerInfo['protocol'], string> = {
  v2: `img:${louvorjaLogoUrl}`,
  v1: `img:${louvorjaLogoUrl}`,
  violin: `img:${violinLogoUrl}`,
  flute: `img:${louvorjaLogoUrl}`,
  piano: 'mdi-link-variant'
}

/** Before a connection is made, there is no program to name yet. */
const icon = computed(() =>
  store.status.server ? ICON[store.status.server.protocol] : 'mdi-link-variant'
)
const title = computed(() =>
  store.status.server
    ? `integration.protocols.${store.status.server.protocol}`
    : 'integration.form.title'
)

type FormValue = { host: string; port: number | null; token: string }
const form = reactive<FormValue>({ host: '', port: null, token: '' })

// Starts from whatever was last saved, unless we are actively connecting/connected to
// something else (which always wins, in case it is being reconnected to something that was
// never explicitly saved).
watch(
  () => store.history.connections,
  (connections) => {
    const saved = connections[0]
    if (saved && !store.isActive) {
      form.host = saved.host
      form.port = saved.port
      form.token = saved.token
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => store.status.endpoint,
  (endpoint) => {
    if (endpoint) {
      form.host = endpoint.host
      form.port = endpoint.port
      form.token = endpoint.token
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="d-flex flex-column ga-5">
    <SettingsSection :icon="icon" :title="$t(title)">
      <template #actions>
        <ConnectionStateChip :state="store.status.state" />
      </template>

      <ConnectionStatus :status="store.status" />
      <ConnectionForm v-model="form" />
    </SettingsSection>

    <ConnectionInfoCard :status="store.status" />
  </div>
</template>
