<script setup lang="ts">
// Icons from Flaticon's UIcons (see NOTICE.md for the required credit): "regular rounded" (a
// semi-bold weight) for the update notice. Only this one family is loaded, not the full set.
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
// "Projeção": one icon from Phosphor Icons' web font, "regular" weight only.
import '@phosphor-icons/web/regular/style.css'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { navItems } from '@/app/navigation'
import { openSettings, settingsOpen } from '@/modules/settings/sections'
import UpdateDialog from '@/components/UpdateDialog.vue'
import { useUpdaterStore } from '@/stores/updater.store'

/** Plain classes, not a Vuetify icon name for <v-icon>: Flaticon's "fi fi-..." or Phosphor's
 *  "ph ph-...". */
const isIconFont = (icon: string): boolean => icon.startsWith('fi ') || icon.startsWith('ph ')

const route = useRoute()
const updater = useUpdaterStore()

const mainItems = navItems.filter((item) => item.area === 'main')
const settingsItem = navItems.find((item) => item.name === 'settings')!

// Only once there is something to act on - not while still checking, and not when it turns out
// there was nothing new.
const updateAvailable = computed(
  () => updater.state.status === 'downloading' || updater.state.status === 'downloaded'
)
const updateDialogOpen = ref(false)
</script>

<template>
  <nav class="app-navbar" data-testid="navbar">
    <div class="navbar-side navbar-left">
      <button
        type="button"
        class="nav-item icon-only"
        :class="{ active: settingsOpen }"
        :title="$t(settingsItem.label)"
        :aria-label="$t(settingsItem.label)"
        :data-testid="`nav-${settingsItem.name}`"
        @click="openSettings()"
      >
        <v-icon class="nav-icon gear-icon" :class="{ 'gear-icon-open': settingsOpen }">
          mdi-cog
        </v-icon>
      </button>
    </div>

    <div class="navbar-nav-main">
      <router-link
        v-for="item in mainItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="nav-item main-item"
        :class="{ active: route.name === item.name }"
        :data-testid="`nav-${item.name}`"
      >
        <i v-if="isIconFont(item.icon)" class="nav-icon nav-icon-fi" :class="item.icon" />
        <v-icon v-else class="nav-icon">{{ item.icon }}</v-icon>
        <span class="nav-text">{{ $t(item.label) }}</span>
      </router-link>
    </div>

    <!-- Otherwise empty, but still flex: 1 like navbar-left - an equal counterweight so the main
         items (above) land centred instead of drifting toward the gear icon's side. -->
    <div class="navbar-side navbar-right">
      <button
        v-if="updateAvailable"
        type="button"
        class="nav-item icon-only update-item"
        :title="$t('settings.updates.available')"
        :aria-label="$t('settings.updates.available')"
        data-testid="nav-update"
        @click="updateDialogOpen = true"
      >
        <i class="nav-icon nav-icon-fi fi fi-rr-down-to-line" />
      </button>
    </div>

    <UpdateDialog v-model="updateDialogOpen" />
  </nav>
</template>

<style lang="scss">
.app-navbar {
  position: fixed;
  top: var(--titlebar-height);
  left: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
  height: var(--navbar-height);
  padding: 0 20px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-bottom: 1px solid var(--sidebar-border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);

  /* Both sides are equally flexible, so the main items in between land dead-centre instead of
     drifting toward whichever side is narrower. */
  .navbar-side {
    display: flex;
    flex: 1;
    align-items: center;
  }

  .navbar-right {
    justify-content: flex-end;
  }

  .navbar-nav-main {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-item {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border: 0;
    border-radius: var(--border-radius);
    background: none;
    color: var(--sidebar-text);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: var(--transition);

    &.main-item {
      font-size: 14px;
      font-weight: 600;
    }

    &.icon-only {
      padding: 10px;
    }

    .nav-icon {
      min-width: 20px;
      font-size: 20px;
      color: var(--accent-blue);
      transition: var(--transition);
    }

    /* A Flaticon or Phosphor icon is a plain <i>, not Vuetify's <v-icon>: centre it the same way
       by hand. */
    .nav-icon-fi {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* "Configurações": the gear spins counter-clockwise (0 to -180deg) opening the drawer, and
       back clockwise (-180 to 0) closing it - the same two values each time, so the direction
       never flips or takes the "short way" around. */
    .gear-icon {
      transition:
        var(--transition),
        transform 0.4s ease;
    }

    .gear-icon-open {
      transform: rotate(-180deg);
    }

    /* A small dot in the corner, the same way an unread count would, so the icon reads as "there
       is something to see here" rather than just another nav button. */
    &.update-item {
      position: relative;

      &::after {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 8px;
        height: 8px;
        border: 2px solid var(--sidebar-bg);
        border-radius: 50%;
        background: var(--accent-yellow);
        content: '';
        animation: update-dot-pulse 1.8s ease-in-out infinite;
      }
    }

    .nav-text {
      padding-bottom: 2px;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: var(--transition);
    }

    /* Under the mouse, not the page you are on: a soft indigo tint. */
    &:hover {
      background: var(--sidebar-hover);
    }

    /* The page you are on: just a line under its own text, no fill. */
    &.active .nav-text {
      border-bottom-color: var(--accent-blue);
    }
  }
}

@keyframes update-dot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.6;
    transform: scale(0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .update-item::after {
    animation: none;
  }
}
</style>
