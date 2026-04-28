---
name: warehouse-experimentation-product
description: Use when building product features, UX flows, or analysis behavior for the ExperimentationPlatform repo. Covers warehouse-native experimentation concepts, global metric and event defaults, experiment-level overrides, multi-variant result presentation, SRM handling, and product expectations for statistical workflows.
---

# Warehouse Experimentation Product

Use this skill when making product or UX decisions in `ExperimentationPlatform`.

## Product Positioning

This product is a warehouse-native experimentation console.

That means:

- the warehouse is the source of truth
- metrics and conversion events are configured globally
- experiments can override defaults locally
- analysis output should feel trustworthy, explicit, and inspectable

## Core Product Entities

- **Experiments**: a registry of experiment runs with one or more variants
- **Metrics**: reusable definitions with global defaults
- **Conversion Events**: reusable event definitions with global conversion windows
- **Dimensions**: shared slicing attributes like country or MCC

## Configuration Hierarchy

Prefer this order of precedence:

1. Experiment-level override
2. Global metric or conversion-event default
3. Seeded or system fallback

Do not blur these levels in the UI. Make it clear whether a value is global or local.

## Metric Rules

- Metrics may support both a window and winsorization.
- Conversion-event metrics support conversion windows, not winsorization.
- Metric definitions should be reusable across experiments.
- Experiment pages may add or remove which metrics are visible without changing the global catalog.

## Variant Rules

- Do not assume two variants.
- Use neutral labels like `Variant 1`, `Variant 2`, etc.
- Treat `Variant 1` as the baseline unless the product later introduces explicit baseline configuration.
- Show pairwise comparisons against the baseline in a way that scales to multi-variant experiments.

## Statistical UX Rules

- Always keep the analysis assumptions visible somewhere near the result.
- If multiple testing correction is applied, say so explicitly.
- SRM should be written in clear operational language.
- Confidence intervals should be visible in the table itself, not hidden in a separate visualization.
- Avoid pretending precision where the analysis is inherently approximate.

## Page Expectations

### Experiments

- The main page should feel like a registry of experiments.
- Users should be able to scan and select an experiment quickly.

### Experiment Detail

- The results table is the primary artifact.
- Inline editing is preferred for per-metric overrides.
- Diagnostics should support the main result, not compete with it.

### Metrics

- This is a reusable catalog, not a per-experiment editor.
- Show global defaults clearly.
- Make SQL inspectable.

### Conversion Events

- Show global conversion windows clearly.
- Make it obvious that these apply everywhere unless overridden in an experiment.
- Make SQL inspectable.

### Dimensions

- Treat dimensions as shared schema, not configurable metrics.
- Show the available dimensions and how many distinct values are present.
- Make SQL inspectable.

## Product Tone

- Write like an internal experimentation tool, not a consumer app.
- Prefer “analyst/operator” language over “growth marketing” language.
- Keep wording direct, short, and precise.

## Avoid

- Hard-coding binary experiment assumptions
- Hiding global/default vs local/override distinctions
- Mixing product settings with one-off result viewing controls
- Treating diagnostics as an afterthought
- Making statistical caveats invisible

## Invocation

Use this skill explicitly with:

`Use /Users/anasfarah/Documents/ExperimentationPlatform/skills/warehouse-experimentation-product/SKILL.md`

Use it when designing product behavior, experimentation workflows, or statistical UX in this repo.
