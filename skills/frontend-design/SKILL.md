---
name: frontend-design
description: Use when improving the ExperimentationPlatform UI or building new frontend surfaces in this repo. Applies a dark, professional experimentation-console style with sharp square panels, dense tables, restrained accents, product-style navigation, and analytics-first layouts inspired by modern experimentation tools rather than soft marketing cards.
---

# Frontend Design

Use this skill when working on frontend UI inside `ExperimentationPlatform`.

## Goals

- Keep the interface dark, professional, and product-like.
- Prefer analytics-console patterns over landing-page patterns.
- Optimize for dense, readable information and decision support.
- Keep edges square or nearly square. Avoid soft rounded cards.
- Make tables, controls, and navigation feel intentional and operational.

## Visual Rules

- Use dark layered surfaces with subtle border separation.
- Prefer thin borders, muted dividers, and limited accent colors.
- Avoid oversized gradients, glassmorphism, playful blobs, and decorative marketing treatments.
- Use accent colors to indicate state, active selection, or statistical emphasis only.
- Prefer neutral typography and compact spacing over oversized hero sections.

## Layout Rules

- Favor app-shell layouts: nav, page header, filters, primary table, secondary diagnostics.
- Put the main decision artifact first:
  experiments list, results table, diagnostics table, settings table, etc.
- Use cards only when they genuinely separate workflows. Do not wrap every element in a card.
- Prefer a dense table over a grid of summary cards when the user is comparing multiple entities.

## Experimentation UI Rules

- Experiments index should feel like a registry, not a dashboard.
- Experiment detail should center the results table.
- Variants should be column headers when comparison is row-oriented.
- Lift should be visualized inline with compact CI bars.
- Statistical notes should be short, precise, and placed near the table they explain.
- SRM, multiple testing, and health notes should read like analyst output, not marketing copy.

## Controls

- Keep controls close to the artifact they affect.
- Use inline edit affordances for row-level settings.
- Use side panels or popovers for small edits, not full-page forms.
- Avoid exposing controls that are not relevant to the selected metric or event.

## Interaction Style

- Prefer explicit actions over hidden magic.
- Keep status text short and operational.
- Use hover and active states sparingly.
- Preserve keyboard-friendly forms and readable focus states.

## Implementation Guidance

- Reuse existing CSS variables and patterns before inventing new ones.
- Keep the visual language consistent across `Experiments`, `Metrics`, `Dimensions`, and `Conversion Events`.
- When adding new components, ask whether they belong in the app shell, a table row, or a compact panel.
- When in doubt, make the UI tighter, calmer, and more legible.

## Avoid

- Rounded “AI app” cards everywhere
- Centered marketing hero layouts for data pages
- Oversized empty-state illustrations
- Too many accent colors
- Excess animation
- Hidden statistical assumptions

## Invocation

Use this skill explicitly with:

`Use /Users/anasfarah/Documents/ExperimentationPlatform/skills/frontend-design/SKILL.md`

Apply it whenever beautifying or restructuring the UI in this repo.
