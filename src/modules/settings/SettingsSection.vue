<script setup lang="ts">
import { computed } from 'vue'

/**
 * A block of related settings: a round icon, a title, a line about what it is for, then the
 * controls. Something small can sit on the right of the header (a state, for example).
 */
const props = defineProps<{ icon: string; title: string; description?: string }>()

/** Plain classes, not a Vuetify icon name for <v-icon>: Flaticon's "fi fi-..." or Phosphor's
 *  "ph ph-...". */
const isIconFont = computed(() => props.icon.startsWith('fi ') || props.icon.startsWith('ph '))
/** A whole picture (a third-party app's own mark, e.g. the LouvorJA Violin logo), not an icon
 *  from a set: "img:<url>", the actual <img> src after the prefix. The icon can change while the
 *  section stays mounted (e.g. switching from a generic placeholder to a detected app's logo once
 *  connected), so this has to stay reactive to the prop instead of being computed only once. */
const isImage = computed(() => props.icon.startsWith('img:'))
const imageSrc = computed(() => props.icon.slice(4))
</script>

<template>
  <section class="settings-section">
    <header class="section-header">
      <span class="section-badge" :class="{ 'section-badge-image': isImage }">
        <img v-if="isImage" :src="imageSrc" alt="" class="section-icon-image" />
        <i v-else-if="isIconFont" class="section-icon-fi" :class="icon" />
        <v-icon v-else size="20">{{ icon }}</v-icon>
      </span>
      <div class="section-heading">
        <h2 class="section-title">{{ title }}</h2>
        <p v-if="description" class="section-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  padding: 20px 22px 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--card-bg);
  box-shadow: var(--shadow);
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.section-badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(75, 166, 150, 0.18) 0%, rgba(20, 184, 166, 0.18) 100%);
  color: var(--accent-blue);
}

/* The Flaticon icon is a plain <i>, not Vuetify's <v-icon>: match its size (size="20" above) and
   centre it the same way by hand. */
.section-icon-fi {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

/* A borrowed app logo already has its own background (e.g. the Violin mark's yellow/blue) - the
   usual tinted wash behind it would just clash, so this badge goes plain instead. */
.section-badge-image {
  overflow: hidden;
  background: none;
}

.section-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.section-heading {
  flex: 1;
  min-width: 0;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 38px;
}

.section-description {
  margin: -4px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.section-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  height: 38px;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
