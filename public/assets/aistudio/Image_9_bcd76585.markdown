---
name: Active Pedagogy
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444653'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#003d27'
  on-tertiary: '#ffffff'
  tertiary-container: '#00563a'
  on-tertiary-container: '#3fd298'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers an energetic, structured, and pedagogical interface for an Activity-Based Learning (A.B.A.) environment. It balances institutional authority with accessible gamification and clear task progression, serving elementary-through-secondary students, teachers, and school administrators.

### Personality & Emotional Tenor
- **Motivating & Affirming:** Rewards incremental progress with dynamic visual feedback, turning student effort into visible accomplishment.
- **Empathetic & Inclusive:** Cognitive load is kept low via modular, chunked information cards, intuitive visual cues, and generous white space.
- **Academic & Orderly:** Maintains structured rigor for educators and administrators needing analytical oversight, rubric grading, and activity management.

### Design Aesthetic
The aesthetic pairs **Modern Utilitarian Clarity** with **Micro-tactile Softness**:
- Uncluttered, crisp spatial arrangements keep focus on learning tasks and rubrics.
- Rounded contours (`roundedness: 2`) soften institutional coldness, making interactive modules welcoming for young learners without alienating adults.
- Subtle layered elevation and soft chromatic glows communicate interactivity and positive validation (WCAG AA compliant across all text-to-background combinations).

## Colors

The palette leverages psychological anchors of trust, active engagement, affirmative reinforcement, and low eye-strain.

### Palette Architecture
- **Primary (`#1E40AF` — Sapphire Blue):** Structural brand anchor. Used for primary navigation bars, dominant action triggers, institution identity, and high-level analytical markers.
- **Secondary (`#4F46E5` — Vibrant Indigo):** Interactive catalyst. Dictates interactive learning units, current active step in multi-phase exercises, primary buttons, and focused states.
- **Tertiary / Success (`#10B981` — Emerald Green):** Pedagogical reinforcement. Used for correct answers, completed activity pills, positive rubric feedback, and mastery percentage bars.
- **Warning / Temporal (`#F59E0B` — Warm Amber):** Countdown timers, submission dead-ends, review-pending notices, and moderation alerts.
- **Neutral Canvas (`#F8FAFC` to `#0F172A`):** A slate-tinted warm neutral spectrum designed to prevent glare on classroom screens and tablets while delivering a clean, modern finish.

### Accessibility Standards
All body text and critical UI elements strictly satisfy WCAG AA contrast (minimum 4.5:1 for body copy and 3:1 for large graphical elements). Background tints for callouts use 10%–12% opacity washes with dark text overlays to preserve readability for neurodiverse students.

## Typography

The typographic hierarchy pairs **Outfit** for structural headers with **Plus Jakarta Sans** for interfaces, activity narratives, and data tables.

- **Outfit (Headlines & Gamified Titles):** Features geometric curves with open apertures, providing high legibility at distance while infusing warmth and optimism into academic challenges.
- **Plus Jakarta Sans (Body & Controls):** Delivers clean readability for reading comprehension passages, multiple-choice questions, and administrative tables. Wide counters prevent letter confusion for early readers.
- **Numerical Figures:** All statistical and timer interfaces should employ tabular lining figures (`font-variant-numeric: tabular-nums`) to prevent layout shifts during live quizzes.

## Layout & Spacing

The layout is anchored on an 8-point baseline grid, shifting to 4-point precision for micro-elements like tags and badges.

### Responsive Breakpoints & Grid Model
- **Desktop (1024px+):** 12-column fluid grid, 24px (`1.5rem`) gutters, max-width container capped at `1440px`. Activity boards split into a 8-column main activity canvas and a 4-column contextual sidebar (rubrics, timers, peers).
- **Tablet (768px – 1023px):** 8-column fluid grid, 20px gutters. Sidebars fold into collapsible overlay sheets or bottom drawer docks.
- **Mobile (< 768px):** 4-column fluid grid, 16px (`1rem`) gutters, 16px margins. Interactive questions stack linearly with bottom sticky progression controls.

### Density Adaptations
- **Student Activity Canvas:** Uses generous spacing (`space-lg` to `space-xl`) to isolate focus areas and avoid accidental taps on touch interfaces.
- **Teacher/Admin Dashboard:** Consolidates density around `space-sm` and `space-md` across grading matrices, student performance tables, and assignment rosters.

## Elevation & Depth

Visual depth is achieved through **Tonal Layering** complemented by **Soft Ambient Shadows**. Harsh drop-shadows are avoided to sustain an approachable atmosphere.

### Depth Hierarchy
- **Level 0 (Canvas Base):** Plain `#F8FAFC` background. Never casts shadows.
- **Level 1 (Card & Module Containers):** Surface color `#FFFFFF` with a 1px border of `rgba(226, 232, 240, 0.8)` and ambient shadow `0 2px 8px -2px rgba(30, 64, 175, 0.04), 0 1px 4px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Interactive Elements & Floating Bars):** Active exercise answer cards and floating timer widgets use `0 8px 24px -4px rgba(30, 64, 175, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modals & Celebration Overlays):** Achievement dialogs, rubric details, and popups use `0 20px 32px -8px rgba(15, 23, 42, 0.16)`. Accompanied by a soft backdrop blur (`backdrop-filter: blur(6px)` with `rgba(15, 23, 42, 0.3)` overlay).

### Feedback Glows
State changes leverage tinted ambient glows rather than blunt border shifts:
- **Success State:** `0 0 0 3px rgba(16, 185, 129, 0.2)` ring.
- **Focus State:** `0 0 0 3px rgba(79, 70, 229, 0.25)` ring.
- **Warning / Impending Deadline State:** `0 0 0 3px rgba(245, 158, 11, 0.2)` ring.

## Shapes

The shape system is set to **`2` (Rounded)**, providing standard elements with an 8px (`0.5rem`) radius, larger containers with a 16px (`1rem`) radius, and feature cards with a 24px (`1.5rem`) radius.

### Application Rules
- **Micro-Controls (Inputs, Buttons, Badges):** 8px (`0.5rem`) radius provides a clear, clickable boundary without sharp vertices.
- **Activity Cards, Modules & Modals:** 16px (`1rem`) radius ensures distinct separation of educational prompts and answers.
- **Progress Badges & Status Chips:** Fully pill-shaped (`9999px`) to distinguish categorical metadata from actionable input fields.
- **Drag-and-Drop / Interactive Targets:** Dashed 2px borders with an 8px radius provide an explicit slot visual metaphor.

## Components

### Buttons
- **Primary (Activity Submission / Confirm):** Background `#4F46E5` (Vibrant Indigo), text white, 8px border radius, font `label-lg`. Micro-interaction: scales down (`scale(0.98)`) on press with an indigo ambient glow.
- **Secondary (Next / Outline):** 1.5px border of `#1E40AF` (Sapphire Blue), transparent background, Sapphire text.
- **Pedagogical Action (Final Complete):** `#10B981` (Emerald Green) fill, white text, reserved for submitting finalized projects or completed modules.
- **Touch Sizing:** Minimum target of 48px height across mobile and tablet viewports.

### Activity Selection Cards & Drag Targets
- Standard surface `#FFFFFF`, 16px radius, bordered by 1.5px `#E2E8F0`.
- **Selected State:** Border color shifts to `#4F46E5`, background shifts to `#EEF2FF`, accompanied by a subtle 2px checkmark badge in the top-right corner.
- **Feedback State (Correct):** Card transitions to `#ECFDF5` background with a `#10B981` border and immediate micro-celebration icon.

### Chips & Badges
- Pill-shaped (`rounded-full`), padding `0.25rem 0.75rem`, font `label-md`.
- **Competency Tag:** `#EFF6FF` background with `#1E40AF` text.
- **Temporal Tag (Timer):** `#FFFBEB` background with `#B45309` text, accompanied by an amber clock glyph.
- **Mastery Tag:** `#ECFDF5` background with `#047857` text.

### Form Inputs & Text Areas
- Background `#FFFFFF`, 1.5px solid border `#CBD5E1`, 8px radius.
- Padding: 12px 16px. Placeholder text in `#94A3B8`.
- **Focus:** Border `#4F46E5` with `0 0 0 3px rgba(79, 70, 229, 0.15)`.
- Teacher rubric assessment sliders use rounded 20px track bars with an Indigo thumb and real-time floating numerical callouts.

### Checkboxes & Radio Buttons
- 20px x 20px boundary with 6px border radius (checkboxes) and fully rounded (radios).
- Active state fills with `#4F46E5` displaying a crisp white centered vector mark.
- Touch target extends to 44px invisible padding to ensure effortless interaction for younger students.

### Progress & Gamification Trackers
- Segmented multi-step progress bar (height 8px, rounded 4px) tracking active learning stages.
- Filled segments transition into `#10B981` upon validated comprehension checks, with an animated shimmer when newly unlocked.