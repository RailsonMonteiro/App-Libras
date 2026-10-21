import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { en, es, pt } from 'vuetify/locale'

// Primary accent teal (#4ba696 since 2026-10-21, was the indigo #6366f1 - see --accent-blue in
// main.scss, kept named for the slot it fills, not its color) over a navy dark theme - the
// app's own identity (2026-09-25), no longer the green/yellow copied from LouvorJA.
export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'system',
    themes: {
      light: {
        dark: false,
        colors: { primary: '#4ba696', background: '#f5f7fb', surface: '#ffffff' }
      },
      dark: {
        dark: true,
        colors: { primary: '#4ba696', background: '#262a3b', surface: '#2f3449' }
      }
    }
  },
  locale: { locale: 'pt', fallback: 'en', messages: { pt, es, en } }
})
