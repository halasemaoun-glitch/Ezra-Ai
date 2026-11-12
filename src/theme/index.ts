/**
 * EZRA Design System — single source of truth for the mobile visual language.
 * Arabic-first RTL, deep-plum surfaces, restrained rose light and amethyst state accents.
 */
export const colors = {
  background: '#0B070D',
  backgroundRaised: '#100A12',
  surface: '#17111B',
  surfaceElevated: '#211923',
  surfaceGlass: 'rgba(35,18,31,0.96)',
  borderSubtle: '#382735',
  border: '#56384F',
  borderStrong: '#80506E',
  textPrimary: '#F7EAF2',
  textSecondary: '#C9B6C8',
  textMuted: '#918B98',
  textDisabled: '#68636E',
  accent: '#D45E91',
  accentBright: '#F09ACD',
  accentSoft: '#B58DAE',
  accentDeep: '#57213F',
  violet: '#B18AFF',
  violetDeep: '#7547C5',
  success: '#9EBD9D',
  warning: '#D9B77A',
  danger: '#F0A4A4',
  onAccent: '#171219',
  orbIdleBase: '#350A2C',
  orbIdleAccent: '#D65BAF',
  orbIdleGlow: '#8E286F',
  orbListeningBase: '#430B35',
  orbListeningAccent: '#FF73C8',
  orbListeningGlow: '#C12B8C',
  orbThinkingBase: '#241039',
  orbThinkingAccent: '#B18AFF',
  orbThinkingGlow: '#7547C5',
  orbSpeakingBase: '#4A0A34',
  orbSpeakingAccent: '#FF91D2',
  orbSpeakingGlow: '#D83D9E',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
  hero: 48,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  panel: 28,
  pill: 999,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const, letterSpacing: 0.1 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: 0.1 },
  heading: { fontSize: 19, lineHeight: 27, fontWeight: '700' as const },
  subheading: { fontSize: 16, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 14, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 14, lineHeight: 22, fontWeight: '600' as const },
  secondary: { fontSize: 12, lineHeight: 19, fontWeight: '400' as const },
  caption: { fontSize: 10, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.25 },
  micro: { fontSize: 9, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.45 },
} as const;

export const shadows = {
  softGlow: { shadowColor: colors.accent, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  heroGlow: { shadowColor: colors.accentBright, shadowOpacity: 0.34, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  panel: { shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

/** Motion is intentionally restrained; tabs remain instant peers, never slide. */
export const motion = {
  duration: { feedback: 120, state: 180, element: 240, surface: 320, cinematic: 520 },
  easing: {
    enter: 'cubic-bezier(0.23, 1, 0.32, 1)',
    move: 'cubic-bezier(0.77, 0, 0.175, 1)',
  },
  navigation: { tabs: 'none', modal: 'slide', screen: 'native' },
  orb: {
    idleBreathSeconds: 8.7,
    listeningPulseSeconds: 2.1,
    thinkingCycleSeconds: 5.45,
    speakingBeatSeconds: 1.16,
    paletteBlendSeconds: 0.21,
  },
  waveform: { listeningResponse: 'voice-energy', thinkingTempoMs: 1050, speakingTempoMs: 360, idleTempoMs: 560 },
  glow: { idleOpacity: 0.18, activeOpacity: 0.72, listeningOpacity: 0.82, thinkingOpacity: 0.48 },
  loading: { dotStaggerMs: 140, shimmerCycleMs: 1800, thinkingOrbitSeconds: 5.45 },
} as const;

export const iconography = {
  strokeWidth: 1.7,
  opticalSize: 22,
  touchTarget: 48,
  glyphs: {
    home: '⌂',
    chat: '◌',
    settings: '⚙',
    history: '◷',
    add: '+',
    close: '×',
    back: '‹',
    send: '↗',
    microphone: '◖',
    files: '▤',
    memory: '◈',
    voice: '♫',
    phone: '▣',
    spark: '✦',
    check: '✓',
    search: '⌕',
    more: '···',
  },
} as const;

export type EzraTextVariant = keyof typeof typography;
export type EzraIconName = keyof typeof iconography.glyphs;
