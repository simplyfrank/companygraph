# Product Research & Buying Guide

Research products with feature analysis, weighted scoring, comparative tables, and per-price-point recommendations. Output markdown + PDF (optimized for reMarkable) to `~/Dropbox/Research/`.

## Usage

- `/buy <product>` — Full product research with buying guide (6 searches, 3 fetches)
- `/buy compare <A> vs <B>` — Side-by-side comparison (8 searches, 4 fetches)
- `/buy cheapest <product>` — Price-focused across vendors (8 searches, 2 fetches)

## Execution Protocol

1. **Parse** the query and detect mode from the first word (compare/cheapest). Default: research.
2. **Search** using WebSearch. Run all searches in parallel. Use the current year (2026) in queries for recency.
3. **Fetch** the top sources from search results using WebFetch. Only fetch sources that will add substantial depth (reviews, spec pages, price comparisons). Run fetches in parallel.
4. **Synthesize** findings into markdown following the template for the detected mode.
5. **Write** the markdown file directly using Write tool. Do NOT show the full content in chat.
6. **Convert** to PDF using Bash: `pandoc "<md_path>" -o "<pdf_path>" --pdf-engine=typst -V papersize=a5 -V margin-top=2cm -V margin-bottom=2cm -V margin-left=2cm -V margin-right=2cm -V mainfont="Palatino" -V fontsize=11pt --toc --toc-depth=2`. If pandoc fails, skip PDF silently — markdown is the primary artifact.
7. **Report** to user: file paths + 3-bullet key findings summary. Keep chat output under 200 words.

### File Naming

- Directory: `~/Dropbox/Research/` (create with `mkdir -p` if needed)
- Resolve symlink: use the real path for `~/Dropbox` (may be `~/Library/CloudStorage/Dropbox`)
- Filename: `YYYY-MM-DD-buy-<slug>.md` where slug is the product lowercased, spaces→hyphens, max 50 chars
- Example: `2026-02-09-buy-wireless-earbuds.md`

### Search Strategy

Craft varied queries to maximize coverage across vendors and review sites:

**Research mode:**
- `"<product> review 2026"`
- `"<product> best price"`
- `"<product> vs alternatives"`
- `"<product> specifications"`
- `"<product> lazada shopee thailand"`
- `"best <category> 2026 buying guide"`

**Compare mode:**
- `"<A> vs <B> comparison 2026"`
- `"<A> review 2026"`, `"<B> review 2026"`
- `"<A> specifications"`, `"<B> specifications"`
- `"<A> price"`, `"<B> price"`
- `"<A> vs <B> reddit"`
- `"<A> vs <B> which should I buy"`

**Cheapest mode:**
- `"<product> best price 2026"`
- `"<product> deal discount coupon"`
- `"<product> price amazon"`
- `"<product> price lazada shopee"`
- `"<product> price ebay"`
- `"<product> price B&H photo"`
- `"<product> price comparison"`
- `"<product> refurbished used price"`

**Target sites:** Amazon.com, Lazada.co.th, Shopee.co.th, B&H Photo, eBay + review sites (rtings.com, wirecutter, techradar, gsmarena, etc.)

## Output Templates

### Research Mode

```markdown
# <Product> — Buying Guide
*Report — <date>*

## Verdict
<1-paragraph recommendation with best pick and price range>

## What Defines Quality
<What matters for this specific product category — 5-8 quality indicators explained in context. Not generic — specific to what makes a great <product>.>

## Key Features to Look For
<Ranked list of must-have vs nice-to-have features. Explain WHY each matters for real-world use.>

## Options Reviewed
<Brief profile of each option considered — 4-8 products. For each: name, price range, 1-sentence positioning.>

## Feature Comparison

| Feature | Weight | Option A | Option B | Option C | ... |
|---------|--------|----------|----------|----------|-----|
| <feature 1> | <1-5> | <rating or value> | ... | ... | |
| <feature 2> | <1-5> | <rating or value> | ... | ... | |
| ... | | | | | |
| **Weighted Score** | | **X.X/10** | **X.X/10** | **X.X/10** | |

Weight scale: 1=minor nice-to-have, 3=important, 5=critical.
Scoring: Rate each feature 1-10, multiply by weight, sum, normalize to /10.

## Recommendations by Price Point

### Budget (under $X)
**Pick: <product>** (Score: X.X/10)
<Why this is the best budget choice — key tradeoffs at this price>

### Mid-Range ($X–$Y)
**Pick: <product>** (Score: X.X/10)
<Why this is the best value — what you gain over budget>

### Premium ($Y+)
**Pick: <product>** (Score: X.X/10)
<Why — what the premium buys you, diminishing returns assessment>

## Pricing

| Product | Amazon | Lazada | Shopee | Other | Best Price |
|---------|--------|--------|--------|-------|------------|
| <name> | <price> | <price> | <price> | <price> | <price + vendor> |

## Reviews Summary
<Aggregated review sentiment — common praise and complaints per option. Note sample sizes where available.>

## Sources
- [Title](URL) — brief note
```

### Compare Mode

```markdown
# <A> vs <B>
*Comparison report — <date>*

## Verdict
<1-paragraph bottom line — which to choose and when>

## Overview

| Dimension | <A> | <B> |
|-----------|-----|-----|
| Price range | | |
| Release date | | |
| Primary use case | | |
| Build quality | | |
| Key strength | | |
| Key weakness | | |

## Feature Comparison

| Feature | Weight | <A> | <B> |
|---------|--------|-----|-----|
| <feature 1> | <1-5> | <rating/value> | <rating/value> |
| <feature 2> | <1-5> | <rating/value> | <rating/value> |
| ... | | | |
| **Weighted Score** | | **X.X/10** | **X.X/10** |

## Detailed Comparison

### <Dimension 1>
<A's approach vs B's approach with evidence>

### <Dimension 2>
<A's approach vs B's approach with evidence>

### <Dimension 3>
<A's approach vs B's approach with evidence>

## Pricing

| Vendor | <A> | <B> |
|--------|-----|-----|
| Amazon | | |
| Lazada | | |
| Shopee | | |
| Other | | |

## Decision Framework
- **Choose <A> if**: <criteria>
- **Choose <B> if**: <criteria>
- **Consider neither if**: <criteria — and what to look at instead>

## Sources
- [Title](URL) — brief note
```

### Cheapest Mode

```markdown
# <Product> — Price Guide
*Price report — <date>*

## Best Deal
<1-paragraph — best price found, where, any caveats>

## Price Comparison

| Vendor | Price | Shipping | Total | Notes |
|--------|-------|----------|-------|-------|
| Amazon | | | | |
| Lazada | | | | |
| Shopee | | | | |
| B&H Photo | | | | |
| eBay | | | | |
| Other | | | | |

## Condition Options

| Condition | Typical Price | Savings vs New | Risk Level |
|-----------|---------------|----------------|------------|
| New | | — | None |
| Open-box | | ~X% | Low |
| Refurbished | | ~X% | Medium |
| Used | | ~X% | Varies |

## Deal Tips
<Active coupons, upcoming sales, price history context, negotiation tips>

## Alternative Models
<If the user could get better value with a different model/version, mention it here with pricing>

## Sources
- [Title](URL) — brief note
```
