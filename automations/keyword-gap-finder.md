# Keyword Gap Finder — Cursor Automation

A reusable [Cursor Automation](https://docs.cursor.com/automations) prompt that
finds **Google Ads keyword gaps**: high-intent search terms (and new product
launches) that are driving clicks but have **no matching active keyword** in your
account. It outputs a prioritized, copy-pasteable plan of keywords to add — with
match types, ad-group fit, and the search-term evidence behind each one.

This runs entirely on **your own** Google Ads data. Nothing here is account- or
company-specific — point it at your account and go.

## What you need

- The **Google Ads MCP** connected (or a Google Ads search-terms export + active
  keyword list you can hand the agent).
- Optional: a **product changelog / launch feed** (a URL or a list of recent
  launches). Including it lets the finder catch gaps created by *new* features
  before search-term volume fully ramps.

## Set it up as an Automation

Create a new Automation in Cursor and paste the prompt below into **Instructions**.
Suggested settings:

| Field | Suggested value |
| --- | --- |
| Name / description | Keyword Gap Finder — weekly non-brand & brand coverage check. |
| Trigger | Weekly (e.g. Monday 8:00 AM), or run on demand. |
| Tools | Google Ads MCP (read). Optionally web fetch for the changelog URL. |
| Delivery | Your choice in the editor — Slack, email, or a saved report/CSV. |

## Instructions (the prompt)

> You are a paid-search strategist. Find keyword gaps in my Google Ads account
> and return a prioritized plan of keywords to add. Use only my real account data
> — never invent search terms, volumes, or keywords.
>
> **Inputs**
> - Account: use the Google Ads MCP for the connected account (ask me which
>   account/customer id if more than one is available).
> - Lookback: last 90 days unless I say otherwise.
> - Optional launches: if I provide a changelog/launch URL or list, fetch it and
>   treat each launch as a candidate theme to find coverage for.
>
> **Steps**
> 1. Pull the **search terms report** (term, impressions, clicks, cost,
>    conversions, conversion value, the matched keyword if any, and the ad group
>    it served from). Pull the list of **active keywords** (text + match type +
>    ad group + status).
> 2. Identify **gaps**: search terms with meaningful volume (default ≥ 50 clicks
>    or ≥ 1 conversion in the window) that have **no active exact/phrase keyword**
>    covering them, or that are only loosely covered by a broad match. For each
>    launch theme (if provided), check whether any active keyword targets it.
> 3. For every gap, classify:
>    - **Brand bucket**: Branded vs Non-branded.
>    - **Coverage status**: e.g. "Missing exact active keyword", "Covered but add
>      variants/segmentation", "Covered".
>    - **Recommended campaign / ad group fit** + a one-line fit note (reuse an
>      existing ad group when intent matches; propose a new ad group only when the
>      intent is genuinely distinct).
>    - **Suggested match types** (default: test Phrase first for non-brand, add
>      Broad only after a conversion signal; Exact + Phrase for brand).
>    - **Observed search evidence**: top search terms with click counts.
>    - **Metrics**: impressions, clicks, cost, conversions, conversion value.
>    - **Suggested landing page** if it's obvious from intent.
> 4. **Prioritize** P1/P2/P3 by conversion volume and cost-efficiency, not raw
>    impressions. Branded gaps and proven-converting non-brand terms rank highest.
>
> **Output**
> - A short headline: how many gaps found, and the top 3 to action this week.
> - A prioritized table with columns: `Priority, Keyword to add, Brand bucket,
>   Coverage status, Recommended ad group fit, Fit note, Suggested match types,
>   Observed search evidence, Impressions, Clicks, Cost, Conversions, Conversion
>   value, Suggested landing page, Notes`.
> - If a launch feed was provided, include `Launch date` and `Launch/theme`
>   columns and cite the source URL per row.
> - Offer to also emit the table as a CSV I can import, and (separately) a Google
>   Ads Editor-style keyword import file for the approved rows.
>
> **Guardrails**
> - Read-only. Do not create, edit, or pause anything in Google Ads — produce a
>   plan I approve first.
> - Respect the volume floor so the list stays actionable; note anything promising
>   but below threshold as a "watchlist" instead of a recommendation.
> - For non-brand, recommend Phrase before Broad and call out when a term needs a
>   conversion signal before scaling.
> - Flag any term that looks like an irrelevant/negative-keyword candidate rather
>   than a gap to add.

## Output shape (reference)

The finder produces rows like:

```
Priority | Keyword to add        | Brand bucket | Coverage status              | Suggested match types | Clicks | Conversions | Notes
P1       | ai code review tool   | Non-branded  | Missing exact active keyword | Phrase + Broad test   | 945    | 30.4        | Test phrase first; promote broad after conversion signal.
P1       | <your brand> pricing  | Branded      | Missing exact active keyword | Exact + Phrase        | 758    | 28.1        | Capture branded feature intent.
```

Approve the rows you want, then ask the agent for the CSV / Editor import file to
push them live.
