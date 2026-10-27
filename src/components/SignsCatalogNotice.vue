<script setup lang="ts">
/**
 * Shown right after the app starts (App.vue) if the signs catalog was never downloaded - nothing
 * shows at all once it has been, on this run or any earlier one (see GlossView.vue's own
 * "catalogMissing" hint for the per-translation version of the same warning).
 */
import { useLibrasStore } from '@/modules/libras/stores/libras.store'

const libras = useLibrasStore()
</script>

<template>
  <v-alert
    v-if="libras.catalog !== null && !libras.catalog.ready"
    type="warning"
    variant="tonal"
    density="compact"
    class="signs-catalog-notice"
    data-testid="signs-catalog-notice"
  >
    {{ $t('libras.catalogHint') }}
    <template #append>
      <v-btn
        size="small"
        variant="text"
        :loading="libras.catalogBusy"
        data-testid="signs-catalog-download"
        @click="libras.refreshCatalog()"
      >
        {{ $t('libras.downloadCatalog') }}
      </v-btn>
    </template>
  </v-alert>
</template>

<style scoped>
.signs-catalog-notice {
  margin-bottom: 20px;
}
</style>
