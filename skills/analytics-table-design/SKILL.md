---
name: analytics-table-design
description: Use when designing or refining experiment result tables, metric registries, diagnostics tables, or other analytics-heavy views inside ExperimentationPlatform. Focuses on dense, legible table systems, inline statistical visualization, sticky operational context, and comparison-first layouts for experimentation workflows.
---

# Analytics Table Design

Use this skill for table-heavy frontend work in `ExperimentationPlatform`, especially:

- experiment results tables
- experiment registry tables
- metric and event catalog tables
- SRM and diagnostics tables
- comparison views with variants, lift, confidence intervals, and p-values

## Primary Objective

Make tables feel like the product, not like a fallback after cards.

## Table Principles

- Prefer tables when users compare many rows or many variants.
- Keep headers explicit and operational.
- Use compact spacing, but never at the expense of scanability.
- Make the first column descriptive and stable.
- Keep statistical columns aligned and easy to compare across rows.
- Use sticky headers when the table becomes long enough to need them.

## Column Design

- Put the entity label first: experiment, metric, event, dimension value.
- Put directly comparable values next.
- Put interpretation columns after raw values:
  relative lift, confidence interval, p-value, adjusted p-value, flags.
- Put destructive or secondary actions last.
- Avoid mixing raw values and actions in the same column.

## Statistical Presentation

- Show confidence intervals inline where the decision is being made.
- Use compact horizontal interval bars instead of large detached charts.
- When multiple comparisons exist, stack them cleanly inside the cell rather than forcing navigation away from the table.
- Always label what a comparison is against.
- If multiple testing correction is applied, say so in plain language directly beneath the table.

## Visual Design

- Use low-contrast separators and restrained borders.
- Avoid zebra stripes unless the table is genuinely hard to scan without them.
- Use accent color to highlight significance, state, or active selection only.
- Use muted text for metadata and stronger text for the primary row identity.
- Keep cells square-edged and consistent with the main app shell.

## Row Behavior

- Inline row editing should be lightweight:
  icon button, compact popover, short form, save and cancel.
- Row actions should not dominate the row.
- Removal actions should remain visually secondary unless destructive confirmation is needed.

## Empty And Loading States

- Empty states should be brief and operational.
- Prefer text guidance over illustrations.
- Loading text should describe what data is being refreshed.

## Avoid

- Turning analytical tables into card grids
- Hiding important statistical context behind tooltips only
- Overloading one cell with too many visual encodings
- Decorative visuals that compete with numeric comparison
- Action-heavy columns before the analysis columns

## Invocation

Use this skill explicitly with:

`Use /Users/anasfarah/Documents/ExperimentationPlatform/skills/analytics-table-design/SKILL.md`

Use it alongside the repo’s frontend design skill when polishing experiment and analytics views.
