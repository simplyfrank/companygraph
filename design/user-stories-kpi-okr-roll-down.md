# User Stories: KPI Definition, OKR Settings, and Roll-Down

## View Mapping

### Current Views

| View Path | Current Purpose | New Purpose (KPI/OKR) |
|-----------|-----------------|----------------------|
| `/views/exec/Transform.tsx` | Executive transformation view | **Executive KPI/OKR Dashboard** |
| `/views/exec/Finance.tsx` | Executive finance view | **Executive Financial KPIs** |
| `/views/exec/Ops.tsx` | Executive operations view | **Executive Operational KPIs** |
| `/views/exec/People.tsx` | Executive people view | **Executive People KPIs** |
| `/views/exec/Risk.tsx` | Executive risk view | **Executive Risk KPIs** |
| `/views/explorer/DomainDetail.tsx` | Domain detail view | **Domain KPI/OKR Management** (already has tabs) |
| `/views/explorer/JourneyDetailSlide.tsx` | Journey detail view | **Journey KPI Alignment** |
| `/views/explorer/Activities.tsx` | Activities view | **Activity KPI Alignment** |
| `/views/analytics/Overview.tsx` | Analytics overview | **KPI/OKR Analytics Dashboard** |
| `/views/analytics/Matrix.tsx` | Analytics matrix | **KPI/OKR Roll-Down Matrix** |

### New Views Needed

| View Path | Purpose | Priority |
|-----------|---------|----------|
| `/views/exec/KpiManagement.tsx` | Executive KPI definition and management | High |
| `/views/exec/OkrManagement.tsx` | Executive OKR cycle management | High |
| `/views/exec/RollDown.tsx` | Executive roll-down to domains | High |
| `/views/explorer/RollDown.tsx` | Domain roll-down to journeys/activities | High |
| `/views/program/ProgramDetail.tsx` | Program detail with KPI/OKR tabs | High |
| `/views/program/ProgramList.tsx` | Program list view | Medium |
| `/views/product/ProductDetail.tsx` | Product detail with KPI/OKR tabs | Medium |
| `/views/product/ProductList.tsx` | Product list view | Medium |
| `/views/product/Portfolio.tsx` | Product portfolio management | Medium |

---

## User Stories by Epic

### Epic 1: Executive KPI Management

#### US-EXEC-KPI-001: Define Organizational KPIs
**As an** Executive Leader  
**I want to** define and manage organization-wide KPIs  
**So that** I can track strategic performance across the organization

**Acceptance Criteria**:
- [ ] Can create new KPI with name, description, category, unit, target value, direction, thresholds, frequency, owner
- [ ] Can edit existing KPI properties
- [ ] Can archive/delete KPIs
- [ ] Can view KPI list with filtering and sorting
- [ ] Can validate KPI measurability before creation
- [ ] Can assign KPIs to domains with contribution weights
- [ ] Can view KPI performance trends

**Screens**: `/views/exec/KpiManagement.tsx`

**API Endpoints**:
- `POST /api/v1/kpis` (existing)
- `PATCH /api/v1/kpis/:id` (existing)
- `DELETE /api/v1/kpis/:id` (existing)
- `GET /api/v1/kpis` (existing)

---

#### US-EXEC-KPI-002: Assign KPIs to Domains
**As an** Executive Leader  
**I want to** assign organizational KPIs to domains with contribution weights  
**So that** I can track domain contributions to organizational targets

**Acceptance Criteria**:
- [ ] Can select KPI and assign to multiple domains
- [ ] Can set domain contribution weights (0-100%)
- [ ] Can set domain-specific targets
- [ ] Can validate that domain weights sum to 100%
- [ ] Can view domain contribution matrix
- [ ] Can edit domain assignments and weights

**Screens**: `/views/exec/KpiManagement.tsx` (new tab: "Domain Assignment")

**API Endpoints**:
- `POST /api/v1/kpi-alignments` (existing, extend for domain target_type)
- `PATCH /api/v1/kpi-alignments/:id` (existing)
- `DELETE /api/v1/kpi-alignments/:id` (existing)
- `GET /api/v1/kpi-alignments?target_type=domain` (existing)

---

#### US-EXEC-KPI-003: Monitor Organizational KPI Performance
**As an** Executive Leader  
**I want to** view organizational KPI performance in real-time  
**So that** I can make data-driven strategic decisions

**Acceptance Criteria**:
- [ ] Can view all organizational KPIs with current values and targets
- [ ] Can see KPI status (on track, warning, critical)
- [ ] Can view KPI trends over time
- [ ] Can drill down into domain contributions
- [ ] Can set up alerts for threshold breaches
- [ ] Can export KPI reports

**Screens**: `/views/exec/Finance.tsx`, `/views/exec/Ops.tsx`, `/views/exec/People.tsx`, `/views/exec/Risk.tsx` (enhance with KPI dashboards)

**API Endpoints**:
- `GET /api/v1/kpi-measurements` (existing)
- `GET /api/v1/kpi-trends` (existing)

---

### Epic 2: Executive OKR Management

#### US-EXEC-OKR-001: Create OKR Cycles
**As an** Executive Leader  
**I want to** create and manage OKR cycles  
**So that** I can set time-bound strategic objectives

**Acceptance Criteria**:
- [ ] Can create OKR cycle with name, description, cycle dates, review cadence
- [ ] Can set cycle status (draft, active, review, closed)
- [ ] Can view all OKR cycles with status
- [ ] Can edit cycle properties
- [ ] Can close cycles and archive

**Screens**: `/views/exec/OkrManagement.tsx`

**API Endpoints**:
- `POST /api/v1/okr-directives` (existing)
- `PATCH /api/v1/okr-directives/:id` (existing)
- `DELETE /api/v1/okr-directives/:id` (existing)
- `GET /api/v1/okr-directives` (existing)

---

#### US-EXEC-OKR-002: Define Strategic Objectives and Key Results
**As an** Executive Leader  
**I want to** define strategic objectives and key results for each OKR cycle  
**So that** I can set clear, measurable goals

**Acceptance Criteria**:
- [ ] Can create objectives with name, description, owner, theme
- [ ] Can create key results with name, description, baseline, target, current value, unit, direction, status
- [ ] Can link key results to organizational KPIs
- [ ] Can set baseline values from KPI historical data
- [ ] Can view objective and KR hierarchy
- [ ] Can edit objectives and KRs

**Screens**: `/views/exec/OkrManagement.tsx` (integrate with OkrCrud component)

**API Endpoints**:
- `POST /api/v1/key-results` (existing)
- `PATCH /api/v1/key-results/:id` (existing)
- `DELETE /api/v1/key-results/:id` (existing)
- `GET /api/v1/key-results?directive_id=...` (existing)

---

#### US-EXEC-OKR-003: Monitor OKR Performance
**As an** Executive Leader  
**I want to** view OKR progress across the organization  
**So that** I can identify at-risk objectives and take action

**Acceptance Criteria**:
- [ ] Can view OKR performance board with summary cards
- [ ] Can see overall progress, achieved count, at-risk count, missed count
- [ ] Can view progress by OKR cycle
- [ ] Can drill down into domain contributions
- [ ] Can view KR-KPI linkages
- [ ] Can set up alerts for at-risk KRs

**Screens**: `/views/exec/OkrManagement.tsx` (integrate with OkrPerformanceBoard component)

**API Endpoints**:
- `GET /api/v1/okr-performance?domain_id=...` (existing, extend for org-level)

---

### Epic 3: Executive Roll-Down

#### US-EXEC-ROLL-001: Roll Down KPIs to Domains
**As an** Executive Leader  
**I want to** roll down organizational KPIs to domains with targets and weights  
**So that** domains have clear accountability for contributions

**Acceptance Criteria**:
- [ ] Can view organizational KPI roll-down matrix
- [ ] Can select domains for each KPI
- [ ] Can set domain contribution weights
- [ ] Can set domain-specific targets
- [ ] Can validate that weights sum to 100%
- [ ] Can communicate roll-down to domain directors
- [ ] Can track domain commitments

**Screens**: `/views/exec/RollDown.tsx`

**API Endpoints**:
- `POST /api/v1/kpi-alignments` (existing)
- `GET /api/v1/kpi-alignments?target_type=domain` (existing)
- New: `POST /api/v1/roll-down/kpi` (batch roll-down)
- New: `GET /api/v1/roll-down/kpi` (view roll-down status)

---

#### US-EXEC-ROLL-002: Roll Down OKRs to Domains
**As an** Executive Leader  
**I want to** roll down organizational OKRs to domains with domain-level objectives  
**So that** domains can align their OKRs to organizational priorities

**Acceptance Criteria**:
- [ ] Can view organizational OKR roll-down matrix
- [ ] Can select domains for each OKR
- [ ] Can define domain-level objectives
- [ ] Can set domain-level KR targets
- [ ] Can link domain KRs to organizational KRs
- [ ] Can validate alignment
- [ ] Can track domain commitments

**Screens**: `/views/exec/RollDown.tsx` (new tab: "OKR Roll-Down")

**API Endpoints**:
- New: `POST /api/v1/roll-down/okr` (batch roll-down)
- New: `GET /api/v1/roll-down/okr` (view roll-down status)

---

#### US-EXEC-ROLL-003: Monitor Roll-Down Effectiveness
**As an** Executive Leader  
**I want to** monitor domain contributions to organizational targets  
**So that** I can identify underperforming domains and provide support

**Acceptance Criteria**:
- [ ] Can view domain contribution dashboard
- [ ] Can see actual vs target contributions
- [ ] Can identify underperforming domains
- [ ] Can view contribution trends over time
- [ ] Can drill down into domain details
- [ ] Can export contribution reports

**Screens**: `/views/exec/RollDown.tsx` (new tab: "Monitoring")

**API Endpoints**:
- New: `GET /api/v1/roll-down/contributions` (contribution analytics)
- New: `GET /api/v1/roll-down/contributions/:domain_id` (domain detail)

---

### Epic 4: Domain KPI Management

#### US-DOM-KPI-001: Define Domain-Specific KPIs
**As a** Domain Director  
**I want to** define domain-specific KPIs  
**So that** I can track domain performance beyond organizational KPIs

**Acceptance Criteria**:
- [ ] Can create domain KPIs with all standard properties
- [ ] Can align domain KPIs to organizational KPIs
- [ ] Can set domain-specific targets
- [ ] Can assign domain KPIs to journeys and activities
- [ ] Can view domain KPI list
- [ ] Can edit domain KPIs

**Screens**: `/views/explorer/DomainDetail.tsx` (KPIs tab, enhance KpiCrud)

**API Endpoints**:
- `POST /api/v1/kpis` (existing)
- `PATCH /api/v1/kpis/:id` (existing)
- `POST /api/v1/kpi-alignments` (existing, extend for journey/activity)
- `GET /api/v1/kpi-alignments?target_type=journey` (existing)
- `GET /api/v1/kpi-alignments?target_type=activity` (existing)

---

#### US-DOM-KPI-002: Align KPIs to Journeys and Activities
**As a** Domain Director  
**I want to** align KPIs to journeys and activities with attribution weights  
**So that** I can track where KPI performance is driven

**Acceptance Criteria**:
- [ ] Can select KPI and align to journeys
- [ ] Can set journey contribution weights
- [ ] Can align KPIs to activities within journeys
- [ ] Can set activity contribution weights
- [ ] Can view KPI-journey-activity alignment matrix
- [ ] Can validate weight calculations

**Screens**: `/views/explorer/DomainDetail.tsx` (KPIs tab, new alignment view)

**API Endpoints**:
- `POST /api/v1/kpi-alignments` (existing)
- `GET /api/v1/kpi-alignments?target_type=journey` (existing)
- `GET /api/v1/kpi-alignments?target_type=activity` (existing)

---

#### US-DOM-KPI-003: Monitor Domain KPI Performance
**As a** Domain Director  
**I want to** view domain KPI performance with journey/activity breakdown  
**So that** I can identify improvement areas

**Acceptance Criteria**:
- [ ] Can view all domain KPIs with current values and targets
- [ ] Can see KPI status (on track, warning, critical)
- [ ] Can drill down into journey contributions
- [ ] Can drill down into activity contributions
- [ ] Can view KPI trends
- [ ] Can set up alerts

**Screens**: `/views/explorer/DomainDetail.tsx` (KPIs tab, enhance KpiDashboard)

**API Endpoints**:
- `GET /api/v1/kpi-measurements` (existing)
- `GET /api/v1/kpi-trends` (existing)
- New: `GET /api/v1/kpi-contributions?domain_id=...` (journey/activity breakdown)

---

### Epic 5: Domain OKR Management

#### US-DOM-OKR-001: Create Domain OKR Cycles
**As a** Domain Director  
**I want to** create domain OKR cycles aligned with organizational OKRs  
**So that** my domain can contribute to organizational objectives

**Acceptance Criteria**:
- [ ] Can view organizational OKR cycles
- [ ] Can create domain OKR cycle linked to organizational cycle
- [ ] Can set domain-specific cycle dates
- [ ] Can set domain review cadence
- [ ] Can view domain OKR cycles
- [ ] Can edit domain OKR cycles

**Screens**: `/views/explorer/DomainDetail.tsx` (OKRs tab, enhance OkrCrud)

**API Endpoints**:
- `POST /api/v1/okr-directives` (existing)
- `GET /api/v1/okr-directives?domain_id=...` (existing)
- New: `GET /api/v1/okr-directives?parent_id=...` (get by parent OKR)

---

#### US-DOM-OKR-002: Define Domain Objectives and Key Results
**As a** Domain Director  
**I want to** define domain objectives and key results  
**So that** my domain has clear, measurable goals

**Acceptance Criteria**:
- [ ] Can create domain objectives aligned to organizational objectives
- [ ] Can create domain key results
- [ ] Can link domain KRs to organizational KRs
- [ ] Can link domain KRs to domain KPIs
- [ ] Can set domain-specific baselines and targets
- [ ] Can view domain OKR hierarchy

**Screens**: `/views/explorer/DomainDetail.tsx` (OKRs tab, enhance OkrCrud)

**API Endpoints**:
- `POST /api/v1/key-results` (existing)
- `GET /api/v1/key-results?directive_id=...` (existing)
- New: `POST /api/v1/okr-kr-kpi-link` (link KR to KPI)
- New: `GET /api/v1/okr-kr-kpi-link` (view KR-KPI links)

---

#### US-DOM-OKR-003: Monitor Domain OKR Performance
**As a** Domain Director  
**I want to** view domain OKR performance board  
**So that** I can track progress and identify at-risk areas

**Acceptance Criteria**:
- [ ] Can view domain OKR performance board
- [ ] Can see summary cards (overall progress, achieved, at-risk, missed)
- [ ] Can view progress by OKR cycle
- [ ] Can view KR-KPI linkages
- [ ] Can update KR current values
- [ ] Can view KR status changes

**Screens**: `/views/explorer/DomainDetail.tsx` (Performance tab, OkrPerformanceBoard)

**API Endpoints**:
- `GET /api/v1/okr-performance?domain_id=...` (existing)
- `PATCH /api/v1/key-results/:id` (existing, for updating current value)

---

### Epic 6: Domain Roll-Down

#### US-DOM-ROLL-001: Receive Organizational Roll-Down
**As a** Domain Director  
**I want to** view and commit to organizational KPI/OKR roll-down  
**So that** I understand my domain's contribution requirements

**Acceptance Criteria**:
- [ ] Can view organizational KPI roll-down assigned to domain
- [ ] Can view domain-specific targets and weights
- [ ] Can view organizational OKR roll-down assigned to domain
- [ ] Can view domain-level objectives and KR targets
- [ ] Can validate achievability
- [ ] Can commit to roll-down targets
- [ ] Can request adjustments if needed

**Screens**: `/views/explorer/DomainDetail.tsx` (new tab: "Roll-Down")

**API Endpoints**:
- `GET /api/v1/roll-down/kpi?domain_id=...` (view KPI roll-down)
- `GET /api/v1/roll-down/okr?domain_id=...` (view OKR roll-down)
- New: `POST /api/v1/roll-down/commit` (commit to roll-down)
- New: `POST /api/v1/roll-down/request-adjustment` (request adjustment)

---

#### US-DOM-ROLL-002: Roll Down to Journeys and Activities
**As a** Domain Director  
**I want to** roll down domain KPIs/OKRs to journeys and activities  
**So that** teams have clear targets

**Acceptance Criteria**:
- [ ] Can select journeys for each domain KPI
- [ ] Can set journey contribution weights
- [ ] Can align domain KPIs to activities
- [ ] Can set activity contribution weights
- [ ] Can roll down domain OKRs to teams
- [ ] Can set team-level objectives and KRs
- [ ] Can validate roll-down completeness

**Screens**: `/views/explorer/DomainDetail.tsx` (Roll-Down tab, journey/activity roll-down view)

**API Endpoints**:
- `POST /api/v1/kpi-alignments` (existing, for journey/activity)
- New: `POST /api/v1/roll-down/journey` (batch journey roll-down)
- New: `POST /api/v1/roll-down/team-okr` (team OKR roll-down)

---

#### US-DOM-ROLL-003: Monitor Journey/Activity Contributions
**As a** Domain Director  
**I want to** monitor journey and activity contributions to domain targets  
**So that** I can identify underperforming areas

**Acceptance Criteria**:
- [ ] Can view journey contribution dashboard
- [ ] Can see actual vs target contributions
- [ ] Can drill down into activity contributions
- [ ] Can view contribution trends
- [ ] Can identify underperforming journeys
- [ ] Can provide support to teams

**Screens**: `/views/explorer/DomainDetail.tsx` (Roll-Down tab, monitoring view)

**API Endpoints**:
- New: `GET /api/v1/roll-down/journey-contributions?domain_id=...`
- New: `GET /api/v1/roll-down/activity-contributions?domain_id=...`

---

### Epic 7: Program KPI/OKR Management

#### US-PROG-KPI-001: Define Program KPIs
**As a** Program Manager  
**I want to** define program-specific KPIs  
**So that** I can track program health and progress

**Acceptance Criteria**:
- [ ] Can create program KPIs (milestone completion, budget, quality, timeline)
- [ ] Can link program KPIs to domain KPIs
- [ ] Can set program-specific targets
- [ ] Can view program KPI list
- [ ] Can edit program KPIs

**Screens**: `/views/program/ProgramDetail.tsx` (new view, KPIs tab)

**API Endpoints**:
- `POST /api/v1/kpis` (existing)
- `PATCH /api/v1/kpis/:id` (existing)
- `POST /api/v1/kpi-alignments` (existing, extend for program target_type)
- `GET /api/v1/kpi-alignments?target_type=program` (new)

---

#### US-PROG-OKR-001: Define Program OKRs
**As a** Program Manager  
**I want to** define program OKRs aligned with domain OKRs  
**So that** my program contributes to domain objectives

**Acceptance Criteria**:
- [ ] Can view domain OKR cycles
- [ ] Can create program OKR cycle linked to domain cycle
- [ ] Can define program objectives
- [ ] Can define program key results
- [ ] Can link program KRs to domain KRs
- [ ] Can link program KRs to program KPIs
- [ ] Can view program OKR hierarchy

**Screens**: `/views/program/ProgramDetail.tsx` (OKRs tab)

**API Endpoints**:
- `POST /api/v1/okr-directives` (existing)
- `POST /api/v1/key-results` (existing)
- New: `GET /api/v1/okr-directives?program_id=...`
- New: `POST /api/v1/okr-directive-link` (link program to domain OKR)

---

#### US-PROG-ROLL-001: Align Program to Domain Roll-Down
**As a** Program Manager  
**I want to** align program to domain roll-down  
**So that** my program contributes to domain targets

**Acceptance Criteria**:
- [ ] Can view domain roll-down
- [ ] Can set program contribution to domain KPIs
- [ ] Can set program contribution to domain OKRs
- [ ] Can define program-specific targets
- [ ] Can validate alignment
- [ ] Can commit to program targets

**Screens**: `/views/program/ProgramDetail.tsx` (Roll-Down tab)

**API Endpoints**:
- New: `POST /api/v1/roll-down/program` (program roll-down)
- New: `GET /api/v1/roll-down/program?program_id=...`

---

#### US-PROG-MON-001: Monitor Program Performance
**As a** Program Manager  
**I want to** monitor program KPI/OKR performance  
**So that** I can report progress to steering committee

**Acceptance Criteria**:
- [ ] Can view program KPI dashboard
- [ ] Can view program OKR performance board
- [ ] Can track program contributions to domain targets
- [ ] Can generate program reports
- [ ] Can identify risks and mitigation actions

**Screens**: `/views/program/ProgramDetail.tsx` (Performance tab)

**API Endpoints**:
- `GET /api/v1/kpi-measurements` (existing)
- `GET /api/v1/okr-performance?program_id=...` (new)
- New: `GET /api/v1/program/contributions?program_id=...`

---

### Epic 8: Product KPI/OKR Management

#### US-PROD-KPI-001: Define Product KPIs
**As a** Product Owner  
**I want to** define product-specific KPIs  
**So that** I can track product performance

**Acceptance Criteria**:
- [ ] Can create product KPIs (revenue, market share, customer satisfaction, quality, time to market)
- [ ] Can link product KPIs to organizational KPIs
- [ ] Can link product KPIs to domain KPIs
- [ ] Can set product-specific targets
- [ ] Can view product KPI list
- [ ] Can edit product KPIs

**Screens**: `/views/product/ProductDetail.tsx` (new view, KPIs tab)

**API Endpoints**:
- `POST /api/v1/kpis` (existing)
- `POST /api/v1/kpi-alignments` (existing, extend for product target_type)
- `GET /api/v1/kpi-alignments?target_type=product` (new)

---

#### US-PROD-OKR-001: Define Product OKRs
**As a** Product Owner  
**I want to** define product OKRs aligned with domain OKRs  
**So that** my product contributes to domain objectives

**Acceptance Criteria**:
- [ ] Can view domain OKR cycles
- [ ] Can create product OKR cycle linked to domain cycle
- [ ] Can define product objectives (feature delivery, user acquisition, quality)
- [ ] Can define product key results
- [ ] Can link product KRs to domain KRs
- [ ] Can link product KRs to product KPIs
- [ ] Can view product OKR hierarchy

**Screens**: `/views/product/ProductDetail.tsx` (OKRs tab)

**API Endpoints**:
- `POST /api/v1/okr-directives` (existing)
- `POST /api/v1/key-results` (existing)
- New: `GET /api/v1/okr-directives?product_id=...`

---

#### US-PROD-ROLL-001: Roll Down to Features
**As a** Product Owner  
**I want to** roll down product OKRs to features  
**So that** teams have clear feature-level targets

**Acceptance Criteria**:
- [ ] Can select features for each product OKR
- [ ] Can set feature contribution weights
- [ ] Can define feature milestones
- [ ] Can assign ownership to teams
- [ ] Can validate roll-down completeness
- [ ] Can track feature delivery progress

**Screens**: `/views/product/ProductDetail.tsx` (Roll-Down tab)

**API Endpoints**:
- New: `POST /api/v1/roll-down/feature` (feature roll-down)
- New: `GET /api/v1/roll-down/feature?product_id=...`

---

#### US-PROD-MON-001: Monitor Product Performance
**As a** Product Owner  
**I want to** monitor product KPI/OKR performance  
**So that** I can make data-driven product decisions

**Acceptance Criteria**:
- [ ] Can view product KPI dashboard
- [ ] Can view product OKR performance board
- [ ] Can track feature delivery progress
- [ ] Can view product portfolio performance
- [ ] Can identify underperforming products

**Screens**: `/views/product/ProductDetail.tsx` (Performance tab)
`/views/product/Portfolio.tsx` (portfolio view)

**API Endpoints**:
- `GET /api/v1/kpi-measurements` (existing)
- `GET /api/v1/okr-performance?product_id=...` (new)
- New: `GET /api/v1/product/portfolio` (portfolio analytics)

---

### Epic 9: Cross-Cutting Features

#### US-CROSS-001: Approval Workflows
**As a** User  
**I want to** submit KPI/OKR definitions for approval  
**So that** changes are reviewed before activation

**Acceptance Criteria**:
- [ ] Can submit KPI definition for approval
- [ ] Can submit OKR definition for approval
- [ ] Can view approval status
- [ ] Can approve/reject submissions
- [ ] Can view approval history
- [ ] Can configure approval rules

**API Endpoints**:
- New: `POST /api/v1/approvals/kpi` (submit KPI for approval)
- New: `POST /api/v1/approvals/okr` (submit OKR for approval)
- New: `PATCH /api/v1/approvals/:id` (approve/reject)
- New: `GET /api/v1/approvals` (view approvals)

---

#### US-CROSS-002: Notifications and Alerts
**As a** User  
**I want to** receive notifications for KPI/OKR events  
**So that** I can stay informed without constantly checking

**Acceptance Criteria**:
- [ ] Can subscribe to KPI threshold alerts
- [ ] Can subscribe to OKR at-risk alerts
- [ ] Can subscribe to roll-down deadline reminders
- [ ] Can configure notification preferences
- [ ] Can view notification history
- [ ] Can receive email/in-app notifications

**API Endpoints**:
- New: `POST /api/v1/notifications/subscriptions` (subscribe)
- New: `GET /api/v1/notifications` (view notifications)
- New: `PATCH /api/v1/notifications/:id` (mark read)

---

#### US-CROSS-003: Analytics and Reporting
**As a** User  
**I want to** generate KPI/OKR reports  
**So that** I can share insights with stakeholders

**Acceptance Criteria**:
- [ ] Can generate KPI performance reports
- [ ] Can generate OKR progress reports
- [ ] Can generate roll-down contribution reports
- [ ] Can customize report parameters
- [ ] Can export reports (PDF, CSV, Excel)
- [ ] Can schedule recurring reports

**Screens**: `/views/analytics/Overview.tsx` (enhance with reporting)

**API Endpoints**:
- New: `POST /api/v1/reports/kpi` (generate KPI report)
- New: `POST /api/v1/reports/okr` (generate OKR report)
- New: `POST /api/v1/reports/roll-down` (generate roll-down report)
- New: `GET /api/v1/reports/:id` (download report)

---

## Implementation Priority

### Phase 1: Foundation (High Priority)
- US-EXEC-KPI-001: Define Organizational KPIs
- US-EXEC-OKR-001: Create OKR Cycles
- US-EXEC-OKR-002: Define Strategic Objectives and Key Results
- US-DOM-KPI-001: Define Domain-Specific KPIs
- US-DOM-OKR-001: Create Domain OKR Cycles
- US-DOM-OKR-002: Define Domain Objectives and Key Results

### Phase 2: Roll-Down (High Priority)
- US-EXEC-KPI-002: Assign KPIs to Domains
- US-EXEC-ROLL-001: Roll Down KPIs to Domains
- US-EXEC-ROLL-002: Roll Down OKRs to Domains
- US-DOM-ROLL-001: Receive Organizational Roll-Down
- US-DOM-ROLL-002: Roll Down to Journeys and Activities

### Phase 3: Monitoring (Medium Priority)
- US-EXEC-KPI-003: Monitor Organizational KPI Performance
- US-EXEC-OKR-003: Monitor OKR Performance
- US-EXEC-ROLL-003: Monitor Roll-Down Effectiveness
- US-DOM-KPI-003: Monitor Domain KPI Performance
- US-DOM-OKR-003: Monitor Domain OKR Performance
- US-DOM-ROLL-003: Monitor Journey/Activity Contributions

### Phase 4: Program Level (Medium Priority)
- US-PROG-KPI-001: Define Program KPIs
- US-PROG-OKR-001: Define Program OKRs
- US-PROG-ROLL-001: Align Program to Domain Roll-Down
- US-PROG-MON-001: Monitor Program Performance

### Phase 5: Product Level (Medium Priority)
- US-PROD-KPI-001: Define Product KPIs
- US-PROD-OKR-001: Define Product OKRs
- US-PROD-ROLL-001: Roll Down to Features
- US-PROD-MON-001: Monitor Product Performance

### Phase 6: Cross-Cutting (Low Priority)
- US-CROSS-001: Approval Workflows
- US-CROSS-002: Notifications and Alerts
- US-CROSS-003: Analytics and Reporting

---

## Dependencies

### Ontology Dependencies
- Add `Program` node label
- Add `Product` node label
- Add `Feature` node label
- Add `CONTRIBUTES_TO` edge for program→domain, product→domain
- Add `HAS_FEATURE` edge for product→feature
- Add `ALIGNED_TO` edge extensions for program, product

### API Dependencies
- Extend KPI alignment for program, product target types
- Add roll-down batch API endpoints
- Add approval workflow endpoints
- Add notification endpoints
- Add reporting endpoints

### UI Dependencies
- Create `/views/program/` directory
- Create `/views/product/` directory
- Create executive KPI/OKR management views
- Create roll-down matrix components
- Create approval workflow components
- Create notification components

---

## Success Metrics

### User Adoption
- KPI definition completion rate > 80%
- OKR cycle participation rate > 90%
- Roll-down compliance rate > 85%

### Data Quality
- KPI measurement completeness > 95%
- OKR progress accuracy > 90%
- Attribution data validity > 85%

### Business Impact
- KPI target achievement rate > 70%
- OKR completion rate > 65%
- Strategic alignment score > 75%

### User Satisfaction
- Ease of use rating > 4/5
- Time to complete tasks < 5 minutes
- Feature satisfaction score > 4/5
