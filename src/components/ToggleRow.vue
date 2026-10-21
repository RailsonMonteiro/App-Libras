<script setup lang="ts">
defineProps<{
  label: string
  modelValue: boolean
  /** Optional second line under the label (e.g. "runInBackgroundHint"). */
  hint?: string
}>()

defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="toggle-row"
    :class="{ 'toggle-row-on': modelValue }"
    :aria-checked="modelValue"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="toggle-row-text">
      <span class="toggle-row-label">{{ label }}</span>
      <span v-if="hint" class="toggle-row-hint">{{ hint }}</span>
    </span>
    <span class="toggle-row-track">
      <span class="toggle-row-thumb" />
    </span>
  </button>
</template>

<style scoped>
/* A whole clickable row (not just a small iOS-style switch floating next to its label), matching
   the tile look used elsewhere in the app (e.g. ProjectionView's .position-tile). The
   track/thumb are drawn in CSS instead of a Vuetify <v-switch>. */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-radius: var(--border-radius);
  background: transparent;
  color: var(--sidebar-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.toggle-row:hover {
  background: var(--sidebar-hover);
}

.toggle-row:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

.toggle-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-row-label {
  font-size: 14px;
}

.toggle-row-hint {
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

.toggle-row-track {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 20px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.3);
  transition: background 0.2s ease;
}

.toggle-row-on .toggle-row-track {
  background: var(--accent-gradient);
}

.toggle-row-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.toggle-row-on .toggle-row-thumb {
  transform: translateX(18px);
}
</style>
