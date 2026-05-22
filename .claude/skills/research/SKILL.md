# Deep Research

Conduct structured topic research using web search. Output markdown + PDF (optimized for reMarkable) to `~/Dropbox/Research/`.

## Usage

- `/research <topic>` — General overview (4 searches, 2 fetches)
- `/research deep <topic>` — Comprehensive deep-dive (8 searches, 4 fetches)
- `/research technical <topic>` — Technical analysis (5 searches, 3 fetches)
- `/research compare <A> vs <B>` — Side-by-side comparison (6 searches, 2 fetches)
- `/research market <topic>` — Market/industry analysis (5 searches, 2 fetches)
- `/research extend <file> <direction>` — Extend existing report (3 searches, 1 fetch)

## Execution Protocol

1. **Parse** the topic and detect mode from the first word (deep/technical/compare/market/extend). Default: general.
2. **Search** using WebSearch. Run all searches in parallel. Use the current year (2026) in queries for recency.
3. **Fetch** the top 1-4 most valuable URLs from search results using WebFetch. Only fetch sources that will add substantial depth. Run fetches in parallel.
4. **Synthesize** findings into markdown following the template for the detected mode.
5. **Write** the markdown file directly using Write tool. Do NOT show the full content in chat.
6. **Convert** to PDF using Bash: `pandoc "<md_path>" -o "<pdf_path>" --pdf-engine=typst -V papersize=a5 -V margin-top=2cm -V margin-bottom=2cm -V margin-left=2cm -V margin-right=2cm -V mainfont="Palatino" -V fontsize=11pt --toc --toc-depth=2`. If pandoc fails, skip PDF silently — markdown is the primary artifact.
7. **Report** to user: file paths + 3-bullet key findings summary. Keep chat output under 200 words.

### File Naming

- Directory: `~/Dropbox/Research/` (create with `mkdir -p` if needed)
- Resolve symlink: use the real path for `~/Dropbox` (may be `~/Library/CloudStorage/Dropbox`)
- Filename: `YYYY-MM-DD-<slug>.md` where slug is the topic lowercased, spaces→hyphens, max 50 chars
- Example: `2026-02-09-ai-in-healthcare.md`

### Search Strategy

Craft varied queries to maximize coverage:
- Include the topic + different angles (overview, trends, challenges, key players, data)
- For technical topics: add "architecture", "implementation", "benchmark", "tradeoffs"
- For comparisons: search each option individually + comparative queries
- Always include one query with the current year for recency

## Output Templates

### General Mode

```markdown
# <Topic>

*Research report — <date>*

## Executive Summary
<2-3 paragraph overview of the topic and key findings>

## Background
<Historical context and foundational concepts>

## Current State
<Where things stand today — recent developments, data points>

## Key Players
<Major companies, organizations, or individuals involved>

## Analysis
<Critical evaluation — what's working, what's not, why it matters>

## Challenges
<Main obstacles, risks, controversies>

## Outlook
<Where the topic is heading — 1-3 year perspective>

## Key Takeaways
1. <Most important insight>
2. <Second insight>
3. <Third insight>

## Sources
- [Title](URL) — brief note
```

### Deep Mode

```markdown
# <Topic> — Deep Dive

*Research report — <date>*

## Executive Summary
<3-4 paragraph comprehensive overview>

## Historical Context
<Origins and evolution of the topic>

## Current Landscape
<Detailed assessment of where things stand>

## Key Players & Ecosystem
<Companies, organizations, individuals — their roles and positions>

## Technical/Operational Details
<How it works — mechanisms, processes, implementation>

## Data & Evidence
<Key statistics, studies, benchmarks — cite sources>

## Analysis
<Multi-angle critical evaluation>

## Contrarian & Alternative Views
<Dissenting opinions, overlooked angles, potential blindspots>

## Challenges & Risks
<Obstacles, threats, failure modes>

## Opportunities
<Untapped potential, emerging possibilities>

## Outlook & Scenarios
<Near-term and long-term projections with reasoning>

## Key Takeaways
1. <Insight>
2. <Insight>
3. <Insight>
4. <Insight>
5. <Insight>

## Sources
- [Title](URL) — brief note
```

### Technical Mode

```markdown
# <Topic> — Technical Analysis

*Research report — <date>*

## Summary
<Concise technical overview and recommendation>

## Architecture & Design
<How it's built — components, patterns, design decisions>

## Implementation
<Practical details — languages, frameworks, setup, configuration>

## Performance
<Benchmarks, scalability characteristics, resource requirements>

## Tradeoffs

| Dimension | Pros | Cons |
|-----------|------|------|
| <aspect> | <pro> | <con> |

## Integration & Ecosystem
<How it fits with other tools, migration paths, compatibility>

## Best Practices
<Recommended approaches, common pitfalls to avoid>

## Recommendation
<When to use it, when not to, and suggested alternatives>

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
| Category | | |
| First released | | |
| License | | |
| Primary use case | | |
| Learning curve | | |
| Community size | | |
| Performance | | |

## Detailed Comparison

### <Dimension 1>
<A's approach vs B's approach with evidence>

### <Dimension 2>
<A's approach vs B's approach with evidence>

### <Dimension 3>
<A's approach vs B's approach with evidence>

## Decision Framework
- **Choose <A> if**: <criteria>
- **Choose <B> if**: <criteria>
- **Consider neither if**: <criteria>

## Sources
- [Title](URL) — brief note
```

### Market Mode

```markdown
# <Topic> — Market Analysis

*Market report — <date>*

## Overview
<Market definition, scope, and current state>

## Market Size & Growth
<TAM, growth rate, projections with sources>

## Key Players

| Company | Position | Revenue/Funding | Key Differentiator |
|---------|----------|-----------------|-------------------|
| | | | |

## Trends
<3-5 major trends shaping the market>

## Competitive Dynamics
<Market structure, barriers to entry, competitive moats>

## Opportunities & Threats
<Where the market is heading, risks to watch>

## Outlook
<1-3 year market projection>

## Sources
- [Title](URL) — brief note
```

### Extend Mode

1. Read the existing file specified by the user.
2. Identify where the new section fits in the document structure.
3. Run 3 targeted searches on the extension direction.
4. Fetch 1 high-value source.
5. Write the updated file (append/insert the new section, update metadata date).
6. Regenerate PDF.
7. Report what was added.
