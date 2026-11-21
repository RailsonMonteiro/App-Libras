<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConnectionState, ConnectionStatus } from '../types/louvorja.types'

const props = defineProps<{ status: ConnectionStatus }>()
const { t } = useI18n()

const ICON: Record<ConnectionState, string> = {
  disconnected: 'mdi-lan-disconnect',
  connecting: 'mdi-lan-pending',
  connected: 'mdi-check-circle',
  reconnecting: 'mdi-lan-pending'
}

const busy = computed(() => ['connecting', 'reconnecting'].includes(props.status.state))

const endpointLabel = computed(() => {
  const endpoint = props.status.endpoint
  return endpoint ? `${endpoint.host}:${endpoint.port}` : ''
})

const errorMessage = computed(() => {
  const error = props.status.lastError
  if (!error) return ''
  const key = error.code === 'http-status' ? 'httpStatus' : error.code
  return t(`integration.errors.${key}`, { detail: error.detail ?? '' })
})

/** Nothing answered at that address (or not in time) - most often LouvorJA's IP changed, or its
 *  server is off: says where in LouvorJA to check the address, port and token, instead of a
 *  technical reason. */
const cannotReach = computed(() => {
  const code = props.status.lastError?.code
  return code === 'unreachable' || code === 'timeout'
})

const retryLabel = computed(() =>
  props.status.retryInMs === null
    ? ''
    : t('integration.status.retryIn', { seconds: Math.ceil(props.status.retryInMs / 1000) })
)
</script>

<template>
  <div class="connection-status" data-testid="connection-status" :data-state="status.state">
    <div class="status-row">
      <v-icon
        :color="status.state === 'connected' ? 'success' : undefined"
        size="22"
        :class="{ 'mdi-spin': busy }"
      >
        {{ busy ? 'mdi-loading' : ICON[status.state] }}
      </v-icon>
      <div class="status-text">
        <template v-if="status.state === 'disconnected'">
          {{ $t('integration.status.idle') }}
        </template>
        <template v-else>
          <div data-testid="connection-endpoint">
            {{ $t('integration.status.endpoint', { endpoint: endpointLabel }) }}
          </div>
          <div
            v-if="status.server"
            class="text-caption text-medium-emphasis"
            data-testid="connection-server"
          >
            {{
              $t('integration.status.server', {
                version: status.server.version ?? '?',
                protocol: status.server.protocol
              })
            }}
          </div>
          <div v-if="status.attempt > 0" class="text-caption text-medium-emphasis">
            {{ $t('integration.status.attempt', { n: status.attempt }) }}
            <template v-if="retryLabel"> · {{ retryLabel }}</template>
          </div>
        </template>
      </div>
    </div>

    <v-alert
      v-if="cannotReach && status.state !== 'connected'"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3 connection-error"
      data-testid="connection-error"
    >
      <div class="help-title">
        {{ $t('integration.errors.help.title', { endpoint: endpointLabel }) }}
      </div>
      <div>{{ $t('integration.errors.help.intro') }}</div>
      <ul class="help-list">
        <li>{{ $t('integration.errors.help.server') }}</li>
        <li>{{ $t('integration.errors.help.address') }}</li>
        <li>{{ $t('integration.errors.help.token') }}</li>
      </ul>
      <div class="help-tip">{{ $t('integration.errors.help.tip') }}</div>
    </v-alert>
    <v-alert
      v-else-if="errorMessage && status.state !== 'connected'"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3 connection-error"
      data-testid="connection-error"
      :text="errorMessage"
    />
  </div>
</template>

<style scoped>
/* The same soft row used for status lines in Settings: an icon, then what it means. */
.status-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
}

.status-text {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
  font-size: 14px;
}

.connection-error :deep(.v-alert__content) {
  font-size: 12px;
}

.connection-error :deep(.v-icon) {
  font-size: 18px;
}

.help-title {
  margin-bottom: 2px;
  font-weight: 500;
}

.help-list {
  margin: 4px 0 4px 18px;
  padding: 0;
}

.help-tip {
  opacity: 0.85;
}
</style>
