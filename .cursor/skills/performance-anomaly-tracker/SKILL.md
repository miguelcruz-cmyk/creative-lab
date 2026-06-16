---
name: performance-anomaly-tracker
description: "When the user wants to detect, investigate, or get alerted about sudden changes in paid ad performance. Use when the user mentions 'anomaly,' 'spike,' 'something looks off,' 'why did spend/CPA/ROAS change,' 'creative fatigue,' 'performance dropped,' 'what changed yesterday/this week,' 'set up alerts,' 'daily performance digest,' or asks to watch an ad account for problems. Works with the Creative Lab data API and/or connected ad-platform MCPs (Meta, TikTok, Snapchat, Reddit, Google Ads)."
metadata:
  version: 1.0.0
---

# Performance Anomaly Tracker

Watch a paid ad account for meaningful changes and surface them as a prioritized,
plain-language digest: what changed, how big it is, the likely cause, and the next
best action. The goal is to catch problems (and wins) early without drowning the
marketer in noise.

## When to Use

- "Why did our CPA jump yesterday?" / "Spend looks off this week."
- "Is anything fatiguing?" / "Which creatives are dying?"
- "Give me a daily/weekly performance digest."
- Setting up a recurring health check (pair with a Cursor Automation).
- Investigating a single metric move on a campaign, ad set, or creative.

## Data Sources

Use whatever is connected, in this order of preference:

1. **Creative Lab API** — `GET /api/meta/creatives?datePreset=...` returns
   normalized, additive base metrics per creative for the account the app is
   connected to. Best when the app is already running. Pull two windows (current
   + trailing baseline) and compare.
2. **Platform MCPs** — Meta / TikTok / Snapchat / Reddit / Google Ads MCP tools
   for accounts not wired into the app, or for breakdowns the app doesn't expose
   (placement, device, geo, hourly).

Never invent numbers. Only report values returned by a tool. If no data source is
connected, say so and stop.

## Method

### 1. Define the comparison

- **Current window**: the period in question (default: yesterday, or the last
  completed day; for weekly digests, the last 7 days).
- **Baseline**: a trailing comparison that controls for seasonality.
  - Day-level: same weekday over the trailing 4 weeks (median), OR the trailing
    7-day median. Avoid comparing a weekend to a weekday.
  - Week-level: the prior 4-week median.
- Pull both windows at the **same grain** you want to alert on (account →
  campaign → ad set → creative).

### 2. Compute change + significance

For each entity and metric, compute:

- **Absolute + relative change** vs baseline (`Δ`, `Δ%`).
- **Robust z-score** using the trailing distribution: `z = (x − median) / (1.4826 × MAD)`.
  MAD (median absolute deviation) resists outliers better than standard deviation.
- Flag an anomaly when **both** `|Δ%|` clears the metric threshold **and**
  `|z| ≥ 3` (tunable). Requiring both keeps low-volume noise out.

### 3. Anomaly checks to run

| Signal | What to look for | Likely meaning |
| --- | --- | --- |
| **Spend spike / drop** | Daily spend ≫ or ≪ baseline | Budget/bid change, auction shift, billing/delivery issue |
| **CPA / CPL drift** | Cost-per-result rising | Conversion-rate drop, audience saturation, tracking break |
| **ROAS / conv-value drop** | Revenue per spend falling | Offer/landing change, low-intent traffic, attribution lag |
| **CTR collapse** | CTR down with impressions up | Creative fatigue, broadened targeting, placement mix shift |
| **Creative fatigue** | Hook rate / hold rate decaying + frequency rising over time | Audience has seen it too often — rotate creative |
| **Under-delivery** | Impressions/spend near zero on an active entity | Rejected/limited ad, exhausted audience, learning-limited |
| **Conversion cliff** | Conversions → 0 while clicks continue | Pixel/CAPI break, broken redirect, tag removed |
| **Frequency surge** | Frequency climbing fast | Narrow audience / budget too high for the pool |

### 4. Rank by impact

Sort alerts by **spend at risk** (or revenue at risk), not just by percentage.
A 60% CPA jump on $50/day matters less than a 15% jump on $5k/day. Tier them:

- **P1 / High** — large spend or revenue exposure, clear break (e.g. conversions
  to zero, spend doubled).
- **P2 / Medium** — meaningful drift worth a same-day look.
- **P3 / Low** — early signal / watchlist.

## Output

Lead with a one-line account headline, then the ranked alerts. For each alert:

```
[P1] CPA up 38% on "Prospecting – Static" (ad set)
  $1,240/day spend · CPA $52 → $72 vs 4-wk weekday median · z=4.1
  Likely: conversion rate fell 31% while CTR held — check landing page / tracking.
  Action: pause the two worst ads (links), verify pixel fired in last 24h.
```

Close with a short **watchlist** (P3s) and, if asked, an **all-clear** line for
the metrics that looked normal. Keep it skimmable — a marketer should grasp it in
under a minute.

If the user is rendering this in the app or wants a richer artifact, offer to
build a Cursor Canvas with the ranked alerts and sparklines instead of a long
markdown table.

## Guardrails

- **Volume floors**: skip entities below a minimum spend or conversion count
  (default: < $50 spend or < 5 conversions in the window) — too noisy to trust.
- **Seasonality**: never compare across weekday/weekend boundaries; prefer
  same-weekday baselines.
- **Attribution lag**: recent conversions undercount. Caveat "today"/"yesterday"
  numbers for conversion metrics, or compare only fully-settled days.
- **Correlation ≠ cause**: phrase causes as hypotheses ("likely," "check"), never
  as confirmed fact. Point to the evidence that would confirm it.
- **No writes**: this skill only reads and reports. Any pause/budget change is a
  separate, explicitly-confirmed action by the user.

## Recurring use (automation)

To run this on a schedule, wire it into a Cursor Automation: trigger each weekday
morning, instructions = "Follow the performance-anomaly-tracker skill for the
connected account, compare yesterday vs the trailing 4-week weekday baseline, and
post the ranked digest to the chosen channel." Pick the delivery destination
(Slack/email) in the Automations editor.
