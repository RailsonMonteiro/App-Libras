export interface NavItem {
  name: string
  /** Material Design Icons class (the same icon set used by LouvorJA). */
  icon: string
  /** vue-i18n key of the label */
  label: string
  /** `main` items sit in the middle of the navbar, `footer` items in its corners. */
  area: 'main' | 'footer'
}

// "Sobre" and "Conexão" live inside Configurações now (their own tabs there, see sections.ts) -
// no longer nav items of their own.
export const navItems: NavItem[] = [
  { name: 'home', icon: 'mdi-home', label: 'nav.home', area: 'main' },
  { name: 'projection', icon: 'mdi-projector-screen', label: 'nav.projection', area: 'main' },
  { name: 'slides', icon: 'mdi-presentation', label: 'nav.slides', area: 'main' },
  { name: 'settings', icon: 'mdi-sort', label: 'nav.settings', area: 'footer' }
]
