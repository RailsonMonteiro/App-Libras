import { ref } from 'vue'

/** The sections of the settings drawer, one tab each. */
export const SETTINGS_SECTIONS = [
  'general',
  'connection',
  'translator',
  'overlay',
  'updates',
  'about'
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_SECTION_ICONS: Record<SettingsSection, string> = {
  general: 'mdi-tune',
  connection: 'mdi-link-variant',
  translator: 'mdi-hand-wave',
  overlay: 'mdi-layers-outline',
  updates: 'mdi-cloud-refresh-outline',
  about: 'mdi-information-outline'
}

/** Whether the drawer (SettingsDrawer.vue) is open. */
export const settingsOpen = ref(false)

/** The open tab - null until one is clicked, so the drawer opens showing just the tab list. */
export const openSection = ref<SettingsSection | null>(null)

/** Opens the drawer fresh: no tab picked yet, regardless of what was open last time. */
export function openSettings(): void {
  openSection.value = null
  settingsOpen.value = true
}

/** Opens the drawer straight to one tab - for links elsewhere that point at a specific setting. */
export function openSettingsSection(name: SettingsSection): void {
  openSection.value = name
  settingsOpen.value = true
}

export function closeSettings(): void {
  settingsOpen.value = false
}
