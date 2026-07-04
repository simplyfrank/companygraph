# Onboarding Dossier: <App Name> (`<app-slug>`)

## Status: draft | reviewed | imported
## Target: <path or git URL> @ <commit SHA>
## Analyzed: <YYYY-MM-DD>
## Stack: <languages / frameworks / service count>

<!-- Produced by the app-onboard synthesis step from the six extraction
     result sets. Every claim carries evidence (file:line) + confidence
     (confirmed / inferred / assumed). Everything `assumed` MUST also appear
     in §6 Open Questions — the validation step enforces this. -->

---

## 1. Executive summary

<3–6 sentences: what business process this application implements, for whom,
and the shape of the proposed model (N domains, N journeys, N activities,
N roles, N systems). Name the app's own core vocabulary.>

## 2. Surface digests

<One compact subsection per surface; cite the strongest evidence, don't dump
every finding — the raw findings live in the workflow transcript.>

### 2.1 Data model
### 2.2 API layer
### 2.3 Event structure
### 2.4 Business logic
### 2.5 Actors & permissions
### 2.6 Integrations & deployment

## 3. Proposed process model

### 3.1 Domains

| Domain | Derived from (evidence) | Confidence |
|--------|------------------------|------------|

### 3.2 Journeys & ordered activities

<Per journey: its domain, the PRECEDES-ordered activity chain, and per
activity the executing role(s) + used system(s).>

| Journey (Domain) | # | Activity | Role(s) | System(s) | Evidence | Confidence |
|------------------|---|----------|---------|-----------|----------|------------|

### 3.3 Roles

| Role | App evidence (auth role / scope / approval step) | Executes | Confidence |
|------|--------------------------------------------------|----------|------------|

### 3.4 Systems & augmentation classification

<The app itself + every external system. systemKind per XD-15:
functional = transactional/CRUD support · agentic = autonomous decision
loops acting on the work · ai_predictive = ML scoring/forecasting informing
the work.>

| System | systemKind | Why (evidence) | INTEGRATES_WITH | Confidence |
|--------|-----------|----------------|-----------------|------------|

### 3.5 Locations (only if the business varies by site)

| Location | Evidence | Confidence |
|----------|----------|------------|

## 4. KPI candidates (proposed — NOT auto-created)

| Candidate KPI | Evidence (rate / SLA / threshold in code) | Would attach to | Confidence |
|---------------|-------------------------------------------|-----------------|------------|

## 5. Import payload summary

- Payload: `import.json` — <N> nodes / <N> edges, deterministic ids
  (`<app-slug>:<label>:<name>` derivation), provenance attributes on every node.
- Edge-type legality: validated against `EDGE_ENDPOINTS` (validation verdict: <pass/fail>).
- Runtime-registry labels required (if any): <none | list + why>

## 6. Open questions & assumed mappings (review-gate agenda)

<Every `assumed`-confidence mapping and every genuine ambiguity, phrased as a
decidable question with the options considered.>

| # | Question | Options | Evidence either way |
|---|----------|---------|---------------------|

## 7. Out of scope / not mapped

<What the analysis deliberately left out (dead code, admin tooling, test
fixtures) and any surface that was absent (`absent_because`).>
