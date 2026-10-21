<script setup lang="ts">
import DeveloperCredit, { type DeveloperLink } from '@/modules/about/components/DeveloperCredit.vue'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import logoUrl from '@/assets/images/logo.svg'
import { useAppStore } from '@/stores/app.store'

const app = useAppStore()

interface Developer {
  id: string
  name: string
  role: string
  avatarUrl: string
  description: string
  links: DeveloperLink[]
}

/**
 * Bios, not UI chrome: kept in Portuguese regardless of the app's own language, the same way a
 * name would not be translated (source: developers.json in the original Louvor JA project).
 */
const DEVELOPERS: Developer[] = [
  {
    id: 'mayco',
    name: 'Mayco Rolbuche',
    role: 'Idealizador e Desenvolvedor Principal',
    avatarUrl: 'https://github.com/maycorolbuche.png',
    description: 'Criador original do projeto Louvor JA.',
    links: [
      { icon: 'mdi-github', url: 'https://github.com/maycorolbuche', label: 'GitHub' },
      { icon: 'mdi-web', url: 'https://maycorolbuche.com.br', label: 'Site' },
      { icon: 'mdi-facebook', url: 'https://www.facebook.com/maycorolbuche', label: 'Facebook' },
      { icon: 'mdi-email', url: 'mailto:mayco.rolbuche@yahoo.com.br', label: 'E-mail' }
    ]
  },
  {
    id: 'railson',
    name: 'Railson Monteiro',
    role: 'Desenvolvedor Principal - LouvorJA Libras',
    avatarUrl: 'https://github.com/railsonmonteiro.png',
    description: 'Responsável pelo desenvolvimento desta distribuição em Libras do Louvor JA.',
    links: [
      { icon: 'mdi-github', url: 'https://github.com/railsonmonteiro', label: 'GitHub' },
      { icon: 'mdi-email', url: 'mailto:railsonmonteiro.tec@gmail.com', label: 'E-mail' }
    ]
  }
]
</script>

<template>
  <div class="d-flex flex-column ga-5">
    <v-card class="about-card">
      <div class="about-glow" />
      <v-card-text class="d-flex flex-column align-center text-center pt-8 pb-8">
        <div class="about-identity">
          <img :src="logoUrl" alt="" class="about-logo" />
          <div class="about-name gradient-text" data-testid="about-name">
            {{ $t('app.name') }}
          </div>
        </div>
        <p class="about-purpose" data-testid="about-purpose">
          {{ $t('about.purpose') }}
        </p>
        <div class="about-version mt-4" data-testid="about-version">
          {{ $t('about.version', { version: app.info?.version ?? '' }) }}
        </div>
      </v-card-text>
    </v-card>

    <SettingsSection
      icon="mdi-account-group"
      :title="$t('about.credits.title')"
      :description="$t('about.credits.description')"
    >
      <DeveloperCredit
        v-for="developer in DEVELOPERS"
        :key="developer.id"
        :name="developer.name"
        :role="developer.role"
        :avatar-url="developer.avatarUrl"
        :description="developer.description"
        :links="developer.links"
        :data-testid="`about-developer-${developer.id}`"
      />
    </SettingsSection>
  </div>
</template>

<style scoped>
.about-card {
  position: relative;
  overflow: hidden;
}

/* A quiet colour wash behind the logo, so the card is not just flat white/navy. */
.about-glow {
  position: absolute;
  inset: -40% -20% auto -20%;
  height: 220px;
  background: radial-gradient(
    ellipse at top,
    rgba(99, 102, 241, 0.16) 0%,
    rgba(20, 184, 166, 0.1) 45%,
    transparent 75%
  );
  pointer-events: none;
}

.about-identity {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.about-logo {
  height: 96px;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
}

/* Same gradient treatment as every page's own title (.gradient-text, main.scss) - the app's own
   signature, not the plain black/white text this used to be. */
.about-name {
  position: relative;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  white-space: nowrap;
}

.about-purpose {
  position: relative;
  max-width: 480px;
  margin: 16px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.about-version {
  position: relative;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.1);
}
</style>
