<script setup lang="ts">
import logoUrl from '@/assets/images/icon_electron.webp'

/* Masks the shine (below) to the logo's own silhouette instead of a plain rectangle - the SVG's
   own alpha (transparent outside the mark) becomes the mask. Bound here rather than baked into
   the scoped <style> because it needs the imported asset URL, which the style block can't see. */
const logoMaskStyle = {
  maskImage: `url(${logoUrl})`,
  WebkitMaskImage: `url(${logoUrl})`
}

/* The loading screen's own logo (index.html) starts its identical 5s sweep with no delay, right
   when the page loads - `performance.now()` here is ms since that same moment. A *negative*
   delay jumps this animation straight to the phase the loading screen's one is already at, so
   the two logos' shine passes at the same instant instead of drifting apart by however long Vue
   took to boot and mount this page. */
const logoShineStyle = {
  animationDelay: `-${(performance.now() % 5000) / 1000}s`
}
</script>

<template>
  <!-- The home page is just the brand: nothing to configure or check here, that all lives on its
       own page (LouvorJA, Slides, Projeção, Configurações, reached from the sidebar). Where the
       app's indigo/teal identity (2026-09-25) started, as a one-page test - now the same colors
       (--accent-blue/--accent-yellow, main.scss) and heading treatment (.gradient-text) as
       everywhere else. -->
  <div class="home-brand" data-testid="home-title">
    <div class="home-logo-wrap">
      <img :src="logoUrl" alt="" class="home-logo" />
      <div class="home-logo-shine-mask" :style="logoMaskStyle" aria-hidden="true">
        <div class="home-logo-shine" :style="logoShineStyle" />
      </div>
    </div>
    <div class="home-text">
      <div class="home-name gradient-text">{{ $t('home.title') }}</div>
      <div class="home-tagline">{{ $t('app.tagline') }}</div>
    </div>
  </div>
</template>

<style scoped>
.home-brand {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  overflow: hidden;
}

/* Padding + a matching negative margin so the wrap can clip the shine to the logo's own box
   (below) without also clipping the drop-shadow the logo itself casts past that box - the wrap
   ends up back at the logo's own footprint from the flex layout's point of view. */
.home-logo-wrap {
  position: relative;
  padding: 40px;
  margin: -40px;
  overflow: hidden;
}

.home-logo {
  position: relative;
  height: 140px;
  /* Off in dark mode (main.scss: --home-logo-glow) - the same blur that reads as a subtle shadow
     on the light background shows up as a glowing box behind the logo on the dark one. */
  filter: var(--home-logo-glow);
  /* TEMPORARY - just a test, remove if it doesn't stick (same wobble as index.html's splash). */
  animation:
    home-logo-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both,
    home-logo-wobble 2s ease-in-out infinite;
}

@keyframes home-logo-wobble {
  0%,
  100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
}

/* The mask itself stays put, aligned with the logo (inset matches the wrap's own padding above,
   so this box lines up with the img, not the extra room left for its drop-shadow) - only the
   gradient inside it (below) slides, so the light is confined to the mark's own shape instead of
   a hard-edged rectangle. */
.home-logo-shine-mask {
  position: absolute;
  inset: 40px;
  overflow: hidden;
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  pointer-events: none;
}

/* Same diagonal shine as the loading screen (index.html) - one soft white band on a slow loop,
   moved with `transform` rather than `background-position` so it stays smooth, sweeping the
   logo and the name (below) together on the same clock. */
.home-logo-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 40%,
    rgba(255, 255, 255, 0.85) 50%,
    transparent 60%
  );
  transform: translateX(-160%);
  animation: home-shine-sweep 5s ease-in-out infinite;
  will-change: transform;
}

@keyframes home-shine-sweep {
  0% {
    transform: translateX(-160%);
  }
  70% {
    transform: translateX(160%);
  }
  100% {
    transform: translateX(160%);
  }
}

.home-text {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: home-logo-in 0.6s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes home-logo-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* .gradient-text (main.scss) gives every other page's title its plain fill; here the same
   accent gradient is the second (bottom) layer under the shine band, layered so only the
   highlight's own position is animated - the accent gradient underneath stays put at "0 0".
   Same clock as .home-logo-shine above, so the name catches the light at the same moment. */
.home-name {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  /* Kept at the old indigo (not --accent-gradient, now teal) - the brand presentation on this
     screen stays as it was, even after the rest of the app's accent colour changed. */
  background:
    linear-gradient(115deg, transparent 40%, rgba(255, 255, 255, 0.9) 50%, transparent 60%),
    linear-gradient(120deg, #6366f1 0%, #14b8a6 100%);
  background-repeat: no-repeat, no-repeat;
  background-size:
    60% 100%,
    100% 100%;
  background-position:
    -160% 0,
    0 0;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: home-shine-sweep-text 5s ease-in-out infinite;
}

@keyframes home-shine-sweep-text {
  0% {
    background-position:
      -160% 0,
      0 0;
  }
  70% {
    background-position:
      260% 0,
      0 0;
  }
  100% {
    background-position:
      260% 0,
      0 0;
  }
}

.home-tagline {
  color: var(--sidebar-text-secondary);
  font-size: 15px;
  font-weight: 500;
}
</style>
