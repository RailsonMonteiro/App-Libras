export interface NavItem {
  name: string
  /**
   * Material Design Icons class (the same icon set used by LouvorJA), or a Phosphor Icons class
   * ("ph ph-...", see AppNavbar.vue) for the items that use it.
   */
  icon: string
  /** vue-i18n key of the label */
  label: string
  /** `main` items sit in the middle of the navbar, `footer` items in its corners. */
  area: 'main' | 'footer'
}

// "Sobre" and "Conexão" live inside Configurações now (their own tabs there, see sections.ts) -
// no longer nav items of their own.
const allNavItems: NavItem[] = [
  { name: 'home', icon: 'ph ph-house', label: 'nav.home', area: 'main' },
  { name: 'projection', icon: 'ph ph-screencast', label: 'nav.projection', area: 'main' },
  { name: 'slides', icon: 'ph ph-cards', label: 'nav.slides', area: 'main' },
  { name: 'settings', icon: 'mdi-sort', label: 'nav.settings', area: 'footer' }
]

// The PowerPoint module (aba Slides) is still a work in progress - visible while iterating on it
// (`npm run dev`), hidden from a built app (`npm run build`/`npm run dist`) until it is ready.
export const navItems: NavItem[] = import.meta.env.DEV
  ? allNavItems
  : allNavItems.filter((item) => item.name !== 'slides')
