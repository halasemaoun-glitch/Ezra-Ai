# EZRA — Visual Design System

Version: 1.0 · Mobile-first · Portrait · Arabic-first / RTL

## Brand direction
EZRA should feel like a private, intelligent companion with a clinical dental knowledge layer — not a generic chat bot. The home screen is the visual anchor: the 3D orb owns the largest visual area, while chat and settings remain quieter, task-focused surfaces.

## Design tokens
The only shared source of visual values is `src/theme/index.ts`.

- **Color:** near-black plum backgrounds; layered aubergine surfaces; restrained rose/magenta accents; amethyst for thinking; ivory text; muted mauve secondary text. Semantic success, warning and danger colors are separate.
- **Typography hierarchy:** Display 32/40, Title 24/32, Heading 19/27, Subheading 16/24, Body 14/23, Secondary 12/19, Caption 10/16, Micro 9/14. Arabic is the default reading direction. Email, codes, URLs and other Latin-only values may opt into LTR. Keep system font scaling enabled.
- **Spacing:** 4-point base rhythm: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48. Screen edges generally use 16–20; related controls use 8–12; sections use 24–40.
- **Corners:** 8 small, 12 control, 16 standard, 20 card, 24–28 large panel, 999 pill/circle. Prefer continuous curves for surfaces.
- **Depth:** subtle rose glow only for primary focus and the orb; cards use low-contrast borders and restrained shadow. Avoid stacking decorative cards inside cards.

## Iconography
Use one-color, simple geometric/line symbols with a consistent 1.7 visual stroke and 22-unit optical size. Icon-only controls need a descriptive accessibility label and a 48dp touch target. Use the shared icon-name map in `iconography.glyphs`; do not introduce emoji as navigation or action icons. Keep icon color secondary unless selected or focused.

## Component contracts
Reusable primitives live in `src/components/DesignSystem.tsx`.

- **Button:** primary / secondary / ghost / danger; small / medium / large; clear pressed, disabled and loading states; accessible label and busy state; minimum 40–56dp height.
- **Input:** shared dark surface, muted placeholder, accent cursor, clear border and error treatment; preserve RTL by default and explicitly use LTR for email/password/technical strings.
- **Card:** surface / raised / glass; consistent border, spacing and radius; use for grouped content, not every row.
- **Text:** named hierarchy variants; do not scatter arbitrary font sizes when a token variant fits.
- **Navigation:** exactly three persistent destinations — Home, Chat, Settings. Home is the default and remains the hero. Tabs are peers and switch instantly; selected state is exclusive and clearly indicated.

## Motion language
Motion is state indication and spatial continuity, not decoration. Use soft ease-out entrances, smooth ease-in-out state changes, and no tab-slide transitions.

### Orb choreography
- **Ready / idle:** slow, low-amplitude breathing; warm magenta/plum palette; restrained halo and drifting particles.
- **Listening:** orb responds to microphone energy; brighter rose rim; waveform amplitude follows live input.
- **Thinking:** amethyst palette; slow energy currents and measured pulse; never use frantic flashing or a full-screen spinner.
- **Speaking:** warmer pink highlights; slightly quicker pulse and waveform rhythm; user can interrupt at any time.

### Audio waves and light
Waveform bars are a secondary state cue. Listening reflects input energy; thinking uses a slow cadence; speaking uses a quicker but low-amplitude cadence. Glow layers stay behind the orb, with opacity and color doing most of the work. Avoid large flashing brightness changes.

### Screen and loading transitions
The existing native modal slide is reserved for a true panel/sheet. Chat/Home/Settings tabs switch without sliding. Loading and thinking retain the current screen, show a concise state label, and use the orb/waveform as the progress cue. For reduced-motion users, the orb freezes its time-based motion while keeping the correct state palette and readable status.

## Layout and language
- All core app screens use portrait orientation and a shared dark visual foundation.
- Home prioritizes the orb and voice action. Chat prioritizes readable message flow and composition. Settings prioritizes clear grouped controls and hierarchy.
- Arabic-first copy aligns right and uses RTL writing direction. English and technical strings explicitly use LTR when needed.
- Reusable elements should align to shared spacing and radius tokens; one-off values require a clear local reason.

## Implementation status
The shared token layer and reusable Text, Button, TextField, Card and Icon primitives are in place. The orb palette, orb palette transition rate, voice waveform cadence and sign-in controls consume the shared system. Existing screen-specific styling is retained incrementally to avoid a risky all-at-once visual rewrite.
