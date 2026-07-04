# Domain Management Enhancements Specification

**Version:** 1.0  
**Date:** 2026-05-23  
**Status:** Draft  
**Related:** companygraph-journeys.html, retail-mini-enriched.json

---

## Overview

This specification defines enhancements to the domain management interface at `#/explorer/domains` to provide richer insights, governance capabilities, and operational visibility across business domains in the companygraph.

**Current State:**
- Basic domain cards showing name, description, journey count, activity count, truncated ID
- No health metrics, ownership information, or cross-domain visibility
- Domains have empty attribute objects in seed data

**Target State:**
- Comprehensive domain health dashboard with aggregate metrics
- Ownership and governance tracking
- Cross-section views for systems, roles, and inter-domain relationships
- Domain comparison and benchmarking
- Lifecycle management capabilities

---

## User Stories

### US-DM-01: Domain Health Dashboard

**As a** business analyst  
**I want** to see a health score and aggregate metrics for each domain  
**So that** I can quickly identify domains requiring attention and prioritize optimization efforts

**Acceptance Criteria:**
- Domain cards display health score (0-100) with color coding:
  - Green (80-100): Healthy
  - Yellow (50-79): Needs attention
  - Red (0-49): Critical
- Health score calculated from:
  - SLA breach rate (weighted 40%)
  - Hand-off complexity (weighted 20%)
  - SoD conflict count (weighted 20%)
  - Initiative completion rate (weighted 20%)
- Aggregate metrics displayed:
  - Total cost per run across all journeys in domain
  - Total runs per month
  - Average cycle time (p50/p99)
  - Active initiative count
- Domain cards sortable by health score, cost, or volume
- Health score tooltip shows breakdown of contributing factors

**UI/UX:**
- Health indicator badge on domain card (top-right)
- Sparkline showing 30-day health trend
- Metric cards below domain description in grid layout
- Color-coded border based on health status

**Data Requirements:**
- SLA breach rate: `COUNT(e:PRECEDES WHERE e.observed_p99_ms > e.sla_p99_ms) / COUNT(e:PRECEDES)`
- Hand-off complexity: Sum of unique role transitions across journeys
- SoD conflicts: Count of activities with conflicting role assignments
- Initiative completion: `COUNT(initiatives WHERE status = 'completed') / COUNT(initiatives)`
- Cost aggregation: Sum of `cost_per_run` from journey attributes
- Volume aggregation: Sum of `runs_per_month` from journey attributes

**Implementation Notes:**
- Add health score calculation to Cypher query in Domains.tsx
- Create health score utility function with configurable weights
- Cache health scores for 5 minutes to reduce query load
- Add health trend tracking via time-series data (future enhancement)

---

### US-DM-02: Domain Ownership & Governance

**As a** domain owner  
**I want** to see ownership information and verification status for each domain  
**So that** I can ensure accountability and maintain governance standards

**Acceptance Criteria:**
- Domain cards display:
  - Accountable role (e.g., "Director of Digital")
  - Last verification date
  - Verification status (verified/stale/expired)
  - Team assignment (derived from journey activities)
- Verification status logic:
  - Verified: < 90 days since last verification
  - Stale: 90-180 days since last verification
  - Expired: > 180 days since last verification
- Team assignment shows top 3 teams by activity count
- Regulatory compliance flags displayed:
  - PCI compliance indicator
  - GDPR compliance indicator
  - Custom compliance tags
- Click on accountable role to view role details

**UI/UX:**
- Ownership section in domain card with avatar/icon
- Verification status badge with color coding
- Team chips with activity count badges
- Compliance icons in card footer
- "Verify Domain" action button for domain owners

**Data Requirements:**
- Domain attributes: `accountable_role`, `verified_date`, `verified_by`
- Team assignment: Aggregate activity team counts via Cypher
- Compliance flags: Journey-level compliance tags aggregated to domain
- Role lookup: Fetch role details from Role nodes

**Implementation Notes:**
- Extend Domain node schema with ownership attributes
- Add verification workflow (separate user story)
- Team assignment calculated dynamically from activity data
- Compliance flags derived from journey regulatory metadata

---

### US-DM-03: Domain Cross-Section Views

**As a** systems architect  
**I want** to see cross-section views of systems, roles, and inter-domain relationships  
**So that** I can understand dependencies and identify optimization opportunities

**Acceptance Criteria:**
- Domain detail page (`#/explorer/domains/:id`) with tabs:
  - **Overview**: Domain health, ownership, journey list
  - **Systems**: Systems used across domain journeys with usage frequency
  - **Roles**: Role/team distribution with activity counts
  - **Hand-offs**: Hand-off matrix showing inter-domain transitions
  - **Integrations**: System integration graph within domain
- Systems tab shows:
  - System name and type
  - Usage count across activities
  - Read/write/async operation breakdown
  - SLA performance per system
- Roles tab shows:
  - Role name and team
  - Activity count
  - Average leverage score
  - Hand-off count (incoming/outgoing)
- Hand-offs tab shows:
  - Matrix of hand-offs between roles/teams
  - Heatmap coloring by frequency
  - SLA breach indicators on hand-off edges
- Integrations tab shows:
  - System integration graph (INTEGRATES_WITH edges)
  - Integration strength (edge count)
  - Critical path identification

**UI/UX:**
- Tab navigation with active state
- Sortable tables with filters
- Interactive heatmaps with hover details
- Force-directed graph for integrations
- Export functionality for each view

**Data Requirements:**
- Systems: `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System) WHERE (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $domainId})`
- Roles: `MATCH (r:Role)-[:EXECUTES]->(a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $domainId})`
- Hand-offs: Role transitions across PRECEDES edges within domain
- Integrations: System INTEGRATES_WITH edges for systems used in domain

**Implementation Notes:**
- Create new DomainDetail view component
- Add route parameter for domain ID
- Implement tab switching with URL hash updates
- Use existing graph visualization components from JourneyGraph
- Add pagination for large datasets

---

### US-DM-04: Domain Comparison

**As a** operations manager  
**I want** to compare domains side-by-side  
**So that** I can identify best practices and benchmark performance

**Acceptance Criteria:**
- Domain comparison modal accessible from domain cards
- Select 2-4 domains for comparison
- Comparison dimensions:
  - Health score
  - Cost per run
  - Runs per month
  - Average cycle time
  - SLA breach rate
  - Hand-off complexity
  - Initiative completion rate
- Visual comparison:
  - Bar charts for numeric metrics
  - Radar chart for multi-dimensional comparison
  - Table view for detailed metrics
- Benchmark identification:
  - Highlight best-performing domain per metric
  - Show delta from average
  - Identify outliers (>2 std dev)
- Export comparison as PDF or CSV

**UI/UX:**
- "Compare" button on domain cards (checkbox selection)
- Comparison modal with split layout
- Metric selector (show/hide dimensions)
- Color coding by performance tier
- Share comparison via URL

**Data Requirements:**
- Same metrics as US-DM-01 for health dashboard
- Statistical calculations for benchmarking
- Domain aggregation queries for comparison

**Implementation Notes:**
- Add selection state to domain cards
- Create comparison modal component
- Use chart library (recharts or similar)
- Implement URL state for shareable comparisons
- Add export functionality

---

### US-DM-05: Domain Lifecycle Management

**As a** domain administrator  
**I want** to create, edit, and archive domains  
**So that** I can maintain an accurate domain inventory over time

**Acceptance Criteria:**
- Create domain:
  - Form with name, description, accountable role
  - Optional: team assignment, compliance tags
  - Validation: unique name, required fields
  - Auto-assign initial verification date
- Edit domain:
  - Update name, description, accountable role
  - Add/remove team assignments
  - Update compliance tags
  - Change history tracked
- Archive domain:
  - Soft delete (set status = 'archived')
  - Confirmation dialog with impact summary
  - Archived domains hidden from default view
  - Restore capability
- Domain audit log:
  - Track all changes with timestamp, user, field, old/new value
  - Viewable in domain detail page
  - Filterable by user, date, action type

**UI/UX:**
- "Create Domain" button on domains index
- Edit/archive actions in domain detail page
- Form validation with inline errors
- Confirmation dialogs for destructive actions
- Audit log table with expandable details
- "View Archived" toggle on index page

**Data Requirements:**
- Domain node attributes: `status` (active/archived), `created_at`, `updated_at`
- Audit trail: separate DomainAudit node or edge
- Validation rules: unique name constraint
- Change tracking: before/after snapshots

**Implementation Notes:**
- Extend Domain node schema with lifecycle attributes
- Create domain CRUD API endpoints
- Add audit logging middleware
- Implement soft delete pattern
- Add permission checks (future enhancement)

---

## Schema Extensions

### Domain Node Attributes

```typescript
interface DomainNode {
  id: string;
  name: string;
  description: string;
  
  // Ownership & Governance
  accountable_role?: string;  // Role ID or name
  verified_date?: string;     // ISO 8601 date
  verified_by?: string;       // User ID
  status?: 'active' | 'archived';
  
  // Lifecycle
  created_at?: string;        // ISO 8601 timestamp
  updated_at?: string;        // ISO 8601 timestamp
  
  // Compliance
  compliance_tags?: string[]; // e.g., ['PCI', 'GDPR']
  
  // Computed (not stored)
  health_score?: number;
  total_cost_per_run?: number;
  total_runs_per_month?: number;
}
```

### Domain Audit Node

```typescript
interface DomainAudit {
  id: string;
  domain_id: string;
  action: 'create' | 'update' | 'archive' | 'restore';
  user_id: string;
  timestamp: string;
  changes?: {
    field: string;
    old_value: any;
    new_value: any;
  }[];
}
```

---

## Implementation Phasing

### Phase 1: Foundation (High Priority)
- US-DM-01: Domain Health Dashboard
- Extend Domain node schema with computed attributes
- Update Domains.tsx with health metrics
- Add health score calculation utility

### Phase 2: Governance (Medium Priority)
- US-DM-02: Domain Ownership & Governance
- Add ownership attributes to Domain nodes
- Implement team assignment aggregation
- Add compliance flag display

### Phase 3: Cross-Section Views (Medium Priority)
- US-DM-03: Domain Cross-Section Views
- Create DomainDetail view component
- Implement tabs for systems, roles, hand-offs, integrations
- Add data aggregation queries

### Phase 4: Comparison (Low Priority)
- US-DM-04: Domain Comparison
- Add domain selection state
- Create comparison modal
- Implement visualization

### Phase 5: Lifecycle (Low Priority)
- US-DM-05: Domain Lifecycle Management
- Create domain CRUD API
- Implement audit logging
- Add create/edit/archive UI

---

## Technical Considerations

### Performance
- Health score queries should be optimized with indexes
- Cache aggregate metrics for 5-10 minutes
- Use pagination for large domain lists
- Consider materialized views for complex aggregations

### Security
- Add permission checks for domain editing (future)
- Audit log for all domain mutations
- Input validation for user-provided data

### Accessibility
- Color coding should have text alternatives
- Keyboard navigation for domain cards
- Screen reader support for health indicators
- High contrast mode support

### Internationalization
- Support for multi-language domain names
- Locale-specific number/date formatting
- Timezone handling for verification dates

---

## Open Questions

1. **Health Score Weights**: Should weights be configurable per organization?
2. **Verification Workflow**: What is the verification process? Who can verify?
3. **Permission Model**: What permissions are needed for domain lifecycle actions?
4. **Historical Data**: Should we track health score history over time?
5. **Integration with Ontology**: How do domain changes interact with ontology events?

---

## Success Metrics

- **Adoption**: 80% of analysts use domain health dashboard within 3 months
- **Efficiency**: 50% reduction in time to identify problematic domains
- **Accuracy**: 90% of domains have ownership information assigned
- **Engagement**: 60% of domains verified within 90-day window
- **Insight**: 25% increase in cross-domain optimization initiatives

---

## References

- [Journey Catalog Wireframe](../companygraph-journeys.html)
- [Seed Data Schema](../../shared/seed/retail-mini-enriched.json)
- [Current Domains Implementation](../../pwa/src/views/explorer/Domains.tsx)
- [Ontology Events](../../ARCHITECTURE.md#ontology-events)
