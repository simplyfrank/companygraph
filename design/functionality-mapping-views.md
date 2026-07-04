# Functionality Mapping Across Views

## Overview

This document maps all KPI/OKR/roll-down functionalities to their respective views, showing what features exist in each view and what needs to be built.

---

## Executive Views

### `/views/exec/Transform.tsx` → Executive KPI/OKR Dashboard

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View organizational KPI summary | ✅ Existing | US-EXEC-KPI-003 | High-level KPI overview |
| View organizational OKR summary | ✅ Existing | US-EXEC-OKR-003 | High-level OKR overview |
| View roll-down status | 🔜 New | US-EXEC-ROLL-003 | Domain contribution tracking |
| Navigate to KPI Management | 🔜 New | US-EXEC-KPI-001 | Link to detailed KPI management |
| Navigate to OKR Management | 🔜 New | US-EXEC-OKR-001 | Link to detailed OKR management |
| Navigate to Roll-Down | 🔜 New | US-EXEC-ROLL-001 | Link to roll-down matrix |

---

### `/views/exec/KpiManagement.tsx` → Executive KPI Management (NEW)

| Tab/Section | Functionality | Status | User Story | API Endpoint |
|-------------|--------------|--------|------------|--------------|
| **KPI List** | View all organizational KPIs | 🔜 New | US-EXEC-KPI-001 | `GET /api/v1/kpis` |
| | Filter by category | 🔜 New | US-EXEC-KPI-001 | `GET /api/v1/kpis` |
| | Sort by name, target, status | 🔜 New | US-EXEC-KPI-001 | `GET /api/v1/kpis` |
| | Search KPIs | 🔜 New | US-EXEC-KPI-001 | `GET /api/v1/kpis` |
| **KPI Detail** | View KPI properties | 🔜 New | US-EXEC-KPI-001 | `GET /api/v1/kpis/:id` |
| | View KPI performance trends | 🔜 New | US-EXEC-KPI-003 | `GET /api/v1/kpi-trends` |
| | View KPI measurements | 🔜 New | US-EXEC-KPI-003 | `GET /api/v1/kpi-measurements` |
| **KPI Creation** | Create new KPI form | 🔜 New | US-EXEC-KPI-001 | `POST /api/v1/kpis` |
| | Validate measurability | 🔜 New | US-EXEC-KPI-001 | - |
| | Save KPI | 🔜 New | US-EXEC-KPI-001 | `POST /api/v1/kpis` |
| **KPI Editing** | Edit KPI properties | 🔜 New | US-EXEC-KPI-001 | `PATCH /api/v1/kpis/:id` |
| | Update targets | 🔜 New | US-EXEC-KPI-001 | `PATCH /api/v1/kpis/:id` |
| | Archive KPI | 🔜 New | US-EXEC-KPI-001 | `DELETE /api/v1/kpis/:id` |
| **Domain Assignment** | Select domains for KPI | 🔜 New | US-EXEC-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Set domain weights | 🔜 New | US-EXEC-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Set domain targets | 🔜 New | US-EXEC-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Validate weight sum = 100% | 🔜 New | US-EXEC-KPI-002 | - |
| | View contribution matrix | 🔜 New | US-EXEC-KPI-002 | `GET /api/v1/kpi-alignments` |

---

### `/views/exec/OkrManagement.tsx` → Executive OKR Management (NEW)

| Tab/Section | Functionality | Status | User Story | API Endpoint |
|-------------|--------------|--------|------------|--------------|
| **OKR Cycles** | View all OKR cycles | 🔜 New | US-EXEC-OKR-001 | `GET /api/v1/okr-directives` |
| | Filter by status | 🔜 New | US-EXEC-OKR-001 | `GET /api/v1/okr-directives` |
| | Sort by date, status | 🔜 New | US-EXEC-OKR-001 | `GET /api/v1/okr-directives` |
| **Cycle Creation** | Create OKR cycle form | 🔜 New | US-EXEC-OKR-001 | `POST /api/v1/okr-directives` |
| | Set cycle dates | 🔜 New | US-EXEC-OKR-001 | `POST /api/v1/okr-directives` |
| | Set review cadence | 🔜 New | US-EXEC-OKR-001 | `POST /api/v1/okr-directives` |
| | Set cycle status | 🔜 New | US-EXEC-OKR-001 | `PATCH /api/v1/okr-directives/:id` |
| **Objectives** | View objectives for cycle | 🔜 New | US-EXEC-OKR-002 | `GET /api/v1/okr-directives/:id` |
| | Create objective form | 🔜 New | US-EXEC-OKR-002 | - (embedded in directive) |
| | Set objective owner | 🔜 New | US-EXEC-OKR-002 | - |
| | Set objective theme | 🔜 New | US-EXEC-OKR-002 | - |
| **Key Results** | View KRs for objective | 🔜 New | US-EXEC-OKR-002 | `GET /api/v1/key-results?directive_id=...` |
| | Create KR form | 🔜 New | US-EXEC-OKR-002 | `POST /api/v1/key-results` |
| | Set baseline value | 🔜 New | US-EXEC-OKR-002 | `POST /api/v1/key-results` |
| | Set target value | 🔜 New | US-EXEC-OKR-002 | `POST /api/v1/key-results` |
| | Set direction (higher/lower) | 🔜 New | US-EXEC-OKR-002 | `POST /api/v1/key-results` |
| | Link KR to KPI | 🔜 New | US-EXEC-OKR-002 | `POST /api/v1/okr-kr-kpi-link` |
| | Set baseline from KPI history | 🔜 New | US-EXEC-OKR-002 | `GET /api/v1/kpi-measurements` |
| | Update current value | 🔜 New | US-EXEC-OKR-003 | `PATCH /api/v1/key-results/:id` |
| | Update KR status | 🔜 New | US-EXEC-OKR-003 | `PATCH /api/v1/key-results/:id` |
| **Performance Board** | View summary cards | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance` |
| | View overall progress | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance` |
| | View achieved/at-risk/missed counts | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance` |
| | View progress by cycle | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance` |
| | View KR-KPI linkages | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance` |
| | Drill down to domains | 🔜 New | US-EXEC-OKR-003 | `GET /api/v1/okr-performance?domain_id=...` |

---

### `/views/exec/RollDown.tsx` → Executive Roll-Down (NEW)

| Tab/Section | Functionality | Status | User Story | API Endpoint |
|-------------|--------------|--------|------------|--------------|
| **KPI Roll-Down** | View KPI roll-down matrix | 🔜 New | US-EXEC-ROLL-001 | `GET /api/v1/roll-down/kpi` |
| | Select domains for KPI | 🔜 New | US-EXEC-ROLL-001 | `POST /api/v1/roll-down/kpi` |
| | Set domain weights | 🔜 New | US-EXEC-ROLL-001 | `POST /api/v1/roll-down/kpi` |
| | Set domain targets | 🔜 New | US-EXEC-ROLL-001 | `POST /api/v1/roll-down/kpi` |
| | Validate weight sum | 🔜 New | US-EXEC-ROLL-001 | - |
| | Communicate roll-down | 🔜 New | US-EXEC-ROLL-001 | `POST /api/v1/roll-down/notify` |
| | Track commitments | 🔜 New | US-EXEC-ROLL-001 | `GET /api/v1/roll-down/kpi` |
| **OKR Roll-Down** | View OKR roll-down matrix | 🔜 New | US-EXEC-ROLL-002 | `GET /api/v1/roll-down/okr` |
| | Select domains for OKR | 🔜 New | US-EXEC-ROLL-002 | `POST /api/v1/roll-down/okr` |
| | Define domain objectives | 🔜 New | US-EXEC-ROLL-002 | `POST /api/v1/roll-down/okr` |
| | Set domain KR targets | 🔜 New | US-EXEC-ROLL-002 | `POST /api/v1/roll-down/okr` |
| | Link domain KRs to org KRs | 🔜 New | US-EXEC-ROLL-002 | `POST /api/v1/roll-down/okr` |
| | Validate alignment | 🔜 New | US-EXEC-ROLL-002 | - |
| | Track commitments | 🔜 New | US-EXEC-ROLL-002 | `GET /api/v1/roll-down/okr` |
| **Monitoring** | View contribution dashboard | 🔜 New | US-EXEC-ROLL-003 | `GET /api/v1/roll-down/contributions` |
| | View actual vs target | 🔜 New | US-EXEC-ROLL-003 | `GET /api/v1/roll-down/contributions` |
| | Identify underperforming domains | 🔜 New | US-EXEC-ROLL-003 | `GET /api/v1/roll-down/contributions` |
| | View contribution trends | 🔜 New | US-EXEC-ROLL-003 | `GET /api/v1/roll-down/contributions` |
| | Drill down to domain details | 🔜 New | US-EXEC-ROLL-003 | `GET /api/v1/roll-down/contributions/:domain_id` |
| | Export reports | 🔜 New | US-EXEC-ROLL-003 | `POST /api/v1/reports/roll-down` |

---

### `/views/exec/Finance.tsx` → Executive Financial KPIs

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View financial KPIs | 🔜 Enhance | US-EXEC-KPI-003 | Revenue, margin, cost KPIs |
| View KPI trends | 🔜 Enhance | US-EXEC-KPI-003 | Historical performance |
| View domain contributions | 🔜 Enhance | US-EXEC-ROLL-003 | Financial contribution breakdown |
| Set alerts | 🔜 Enhance | US-CROSS-002 | Threshold breach notifications |

---

### `/views/exec/Ops.tsx` → Executive Operational KPIs

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View operational KPIs | 🔜 Enhance | US-EXEC-KPI-003 | Efficiency, quality KPIs |
| View KPI trends | 🔜 Enhance | US-EXEC-KPI-003 | Historical performance |
| View domain contributions | 🔜 Enhance | US-EXEC-ROLL-003 | Operational contribution breakdown |
| Set alerts | 🔜 Enhance | US-CROSS-002 | Threshold breach notifications |

---

### `/views/exec/People.tsx` → Executive People KPIs

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View people KPIs | 🔜 Enhance | US-EXEC-KPI-003 | Engagement, retention KPIs |
| View KPI trends | 🔜 Enhance | US-EXEC-KPI-003 | Historical performance |
| View domain contributions | 🔜 Enhance | US-EXEC-ROLL-003 | People contribution breakdown |
| Set alerts | 🔜 Enhance | US-CROSS-002 | Threshold breach notifications |

---

### `/views/exec/Risk.tsx` → Executive Risk KPIs

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View risk KPIs | 🔜 Enhance | US-EXEC-KPI-003 | Risk exposure, mitigation KPIs |
| View KPI trends | 🔜 Enhance | US-EXEC-KPI-003 | Historical performance |
| View domain contributions | 🔜 Enhance | US-EXEC-ROLL-003 | Risk contribution breakdown |
| Set alerts | 🔜 Enhance | US-CROSS-002 | Threshold breach notifications |

---

## Domain Views

### `/views/explorer/DomainDetail.tsx` → Domain Detail

| Tab | Functionality | Status | User Story | API Endpoint |
|-----|--------------|--------|------------|--------------|
| **Overview** | View domain health | ✅ Existing | - | - |
| | View domain KPI summary | ✅ Existing | US-DOM-KPI-003 | `GET /api/v1/kpi-alignments` |
| | View domain OKR summary | 🔜 New | US-DOM-OKR-003 | `GET /api/v1/okr-performance` |
| **KPIs** | View domain KPIs | ✅ Existing | US-DOM-KPI-001 | `GET /api/v1/kpi-alignments` |
| | Create domain KPI | 🔜 Enhance | US-DOM-KPI-001 | `POST /api/v1/kpis` |
| | Edit domain KPI | 🔜 Enhance | US-DOM-KPI-001 | `PATCH /api/v1/kpis/:id` |
| | Align KPI to journeys | 🔜 New | US-DOM-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Set journey weights | 🔜 New | US-DOM-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Align KPI to activities | 🔜 New | US-DOM-KPI-002 | `POST /api/v1/kpi-alignments` |
| | Set activity weights | 🔜 New | US-DOM-KPI-002 | `POST /api/v1/kpi-alignments` |
| | View alignment matrix | 🔜 New | US-DOM-KPI-002 | `GET /api/v1/kpi-alignments` |
| | View KPI performance | ✅ Existing | US-DOM-KPI-003 | `GET /api/v1/kpi-measurements` |
| | Drill down to journeys | 🔜 New | US-DOM-KPI-003 | `GET /api/v1/kpi-contributions` |
| | Drill down to activities | 🔜 New | US-DOM-KPI-003 | `GET /api/v1/kpi-contributions` |
| **OKRs** | View domain OKR cycles | ✅ Existing | US-DOM-OKR-001 | `GET /api/v1/okr-directives` |
| | Create domain OKR cycle | ✅ Existing | US-DOM-OKR-001 | `POST /api/v1/okr-directives` |
| | Link to org OKR cycle | 🔜 New | US-DOM-OKR-001 | `POST /api/v1/okr-directives` |
| | View domain objectives | 🔜 New | US-DOM-OKR-002 | `GET /api/v1/okr-directives/:id` |
| | Create domain objective | 🔜 New | US-DOM-OKR-002 | - |
| | View domain KRs | ✅ Existing | US-DOM-OKR-002 | `GET /api/v1/key-results` |
| | Create domain KR | ✅ Existing | US-DOM-OKR-002 | `POST /api/v1/key-results` |
| | Link KR to org KR | 🔜 New | US-DOM-OKR-002 | `POST /api/v1/okr-kr-link` |
| | Link KR to domain KPI | 🔜 New | US-DOM-OKR-002 | `POST /api/v1/okr-kr-kpi-link` |
| | Update KR current value | 🔜 New | US-DOM-OKR-003 | `PATCH /api/v1/key-results/:id` |
| | Update KR status | 🔜 New | US-DOM-OKR-003 | `PATCH /api/v1/key-results/:id` |
| **Performance** | View performance board | ✅ Existing | US-DOM-OKR-003 | `GET /api/v1/okr-performance` |
| | View summary cards | ✅ Existing | US-DOM-OKR-003 | `GET /api/v1/okr-performance` |
| | View progress by cycle | ✅ Existing | US-DOM-OKR-003 | `GET /api/v1/okr-performance` |
| | View KR-KPI linkages | ✅ Existing | US-DOM-OKR-003 | `GET /api/v1/okr-performance` |
| **Roll-Down** (NEW) | View org KPI roll-down | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/kpi?domain_id=...` |
| | View domain targets | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/kpi?domain_id=...` |
| | View domain weights | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/kpi?domain_id=...` |
| | Validate achievability | 🔜 New | US-DOM-ROLL-001 | - |
| | Commit to roll-down | 🔜 New | US-DOM-ROLL-001 | `POST /api/v1/roll-down/commit` |
| | Request adjustment | 🔜 New | US-DOM-ROLL-001 | `POST /api/v1/roll-down/request-adjustment` |
| | View org OKR roll-down | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/okr?domain_id=...` |
| | View domain objectives | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/okr?domain_id=...` |
| | View domain KR targets | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/okr?domain_id=...` |
| | Roll down to journeys | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/journey` |
| | Set journey weights | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/journey` |
| | Roll down to activities | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/kpi-alignments` |
| | Set activity weights | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/kpi-alignments` |
| | Roll down OKRs to teams | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/team-okr` |
| | View journey contributions | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/journey-contributions` |
| | View activity contributions | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/activity-contributions` |
| | Identify underperforming journeys | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/journey-contributions` |

---

### `/views/explorer/RollDown.tsx` → Domain Roll-Down Detail (NEW)

| Tab/Section | Functionality | Status | User Story | API Endpoint |
|-------------|--------------|--------|------------|--------------|
| **KPI Roll-Down** | View org KPI roll-down | 🔜 New | US-DOM-ROLL-001 | `GET /api/v1/roll-down/kpi?domain_id=...` |
| | Commit to targets | 🔜 New | US-DOM-ROLL-001 | `POST /api/v1/roll-down/commit` |
| | Request adjustment | 🔜 New | US-DOM-ROLL-001 | `POST /api/v1/roll-down/request-adjustment` |
| **Journey Roll-Down** | Select journeys for KPI | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/journey` |
| | Set journey weights | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/journey` |
| | Set journey targets | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/journey` |
| | View journey matrix | 🔜 New | US-DOM-ROLL-002 | `GET /api/v1/kpi-alignments?target_type=journey` |
| **Activity Roll-Down** | Select activities for KPI | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/kpi-alignments` |
| | Set activity weights | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/kpi-alignments` |
| | View activity matrix | 🔜 New | US-DOM-ROLL-002 | `GET /api/v1/kpi-alignments?target_type=activity` |
| **Team OKR Roll-Down** | Define team objectives | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/team-okr` |
| | Define team KRs | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/team-okr` |
| | Link to domain KRs | 🔜 New | US-DOM-ROLL-002 | `POST /api/v1/roll-down/team-okr` |
| **Monitoring** | View journey contributions | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/journey-contributions` |
| | View activity contributions | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/activity-contributions` |
| | View contribution trends | 🔜 New | US-DOM-ROLL-003 | `GET /api/v1/roll-down/journey-contributions` |

---

### `/views/explorer/JourneyDetailSlide.tsx` → Journey Detail

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View journey KPIs | ✅ Existing | US-DOM-KPI-002 | KPIs aligned to journey |
| View KPI weights | 🔜 Enhance | US-DOM-KPI-002 | Contribution weights |
| View KPI performance | 🔜 Enhance | US-DOM-KPI-003 | Journey-level performance |
| Add KPI alignment | 🔜 Enhance | US-DOM-KPI-002 | Align new KPI to journey |
| Edit KPI weights | 🔜 Enhance | US-DOM-KPI-002 | Update contribution weights |

---

### `/views/explorer/Activities.tsx` → Activities View

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View activity KPIs | 🔜 Enhance | US-DOM-KPI-002 | KPIs aligned to activity |
| View KPI weights | 🔜 Enhance | US-DOM-KPI-002 | Contribution weights |
| View KPI performance | 🔜 Enhance | US-DOM-KPI-003 | Activity-level performance |
| Add KPI alignment | 🔜 Enhance | US-DOM-KPI-002 | Align new KPI to activity |
| Edit KPI weights | 🔜 Enhance | US-DOM-KPI-002 | Update contribution weights |

---

## Program Views

### `/views/program/ProgramList.tsx` → Program List (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| View all programs | 🔜 New | - | `GET /api/v1/programs` |
| Filter by domain | 🔜 New | - | `GET /api/v1/programs?domain_id=...` |
| Filter by status | 🔜 New | - | `GET /api/v1/programs?status=...` |
| Search programs | 🔜 New | - | `GET /api/v1/programs` |
| Create new program | 🔜 New | - | `POST /api/v1/programs` |
| Navigate to program detail | 🔜 New | - | - |

---

### `/views/program/ProgramDetail.tsx` → Program Detail (NEW)

| Tab | Functionality | Status | User Story | API Endpoint |
|-----|--------------|--------|------------|--------------|
| **Overview** | View program summary | 🔜 New | - | `GET /api/v1/programs/:id` |
| | View program KPI summary | 🔜 New | US-PROG-KPI-001 | `GET /api/v1/kpi-alignments?target_type=program` |
| | View program OKR summary | 🔜 New | US-PROG-OKR-001 | `GET /api/v1/okr-performance?program_id=...` |
| **KPIs** | View program KPIs | 🔜 New | US-PROG-KPI-001 | `GET /api/v1/kpi-alignments?target_type=program` |
| | Create program KPI | 🔜 New | US-PROG-KPI-001 | `POST /api/v1/kpis` |
| | Edit program KPI | 🔜 New | US-PROG-KPI-001 | `PATCH /api/v1/kpis/:id` |
| | Link to domain KPIs | 🔜 New | US-PROG-KPI-001 | `POST /api/v1/kpi-alignments` |
| | Set program targets | 🔜 New | US-PROG-KPI-001 | `POST /api/v1/kpi-alignments` |
| | View KPI performance | 🔜 New | US-PROG-MON-001 | `GET /api/v1/kpi-measurements` |
| **OKRs** | View program OKR cycles | 🔜 New | US-PROG-OKR-001 | `GET /api/v1/okr-directives?program_id=...` |
| | Create program OKR cycle | 🔜 New | US-PROG-OKR-001 | `POST /api/v1/okr-directives` |
| | Link to domain OKR cycle | 🔜 New | US-PROG-OKR-001 | `POST /api/v1/okr-directive-link` |
| | View program objectives | 🔜 New | US-PROG-OKR-001 | `GET /api/v1/okr-directives/:id` |
| | Create program objective | 🔜 New | US-PROG-OKR-001 | - |
| | View program KRs | 🔜 New | US-PROG-OKR-001 | `GET /api/v1/key-results?directive_id=...` |
| | Create program KR | 🔜 New | US-PROG-OKR-001 | `POST /api/v1/key-results` |
| | Link KR to domain KR | 🔜 New | US-PROG-OKR-001 | `POST /api/v1/okr-kr-link` |
| | Link KR to program KPI | 🔜 New | US-PROG-OKR-001 | `POST /api/v1/okr-kr-kpi-link` |
| | Update KR progress | 🔜 New | US-PROG-MON-001 | `PATCH /api/v1/key-results/:id` |
| **Roll-Down** | View domain roll-down | 🔜 New | US-PROG-ROLL-001 | `GET /api/v1/roll-down/program?program_id=...` |
| | Set program contribution | 🔜 New | US-PROG-ROLL-001 | `POST /api/v1/roll-down/program` |
| | Set program targets | 🔜 New | US-PROG-ROLL-001 | `POST /api/v1/roll-down/program` |
| | Validate alignment | 🔜 New | US-PROG-ROLL-001 | - |
| | Commit to targets | 🔜 New | US-PROG-ROLL-001 | `POST /api/v1/roll-down/commit` |
| **Workstreams** | View workstreams | 🔜 New | US-PROG-ROLL-001 | `GET /api/v1/workstreams?program_id=...` |
| | Define workstream targets | 🔜 New | US-PROG-ROLL-001 | `POST /api/v1/workstreams` |
| | Assign ownership | 🔜 New | US-PROG-ROLL-001 | `POST /api/v1/workstreams` |
| **Performance** | View KPI dashboard | 🔜 New | US-PROG-MON-001 | `GET /api/v1/kpi-measurements` |
| | View OKR performance board | 🔜 New | US-PROG-MON-001 | `GET /api/v1/okr-performance?program_id=...` |
| | View contributions to domain | 🔜 New | US-PROG-MON-001 | `GET /api/v1/program/contributions` |
| | Generate reports | 🔜 New | US-PROG-MON-001 | `POST /api/v1/reports/program` |
| | Identify risks | 🔜 New | US-PROG-MON-001 | `GET /api/v1/program/risks` |

---

## Product Views

### `/views/product/ProductList.tsx` → Product List (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| View all products | 🔜 New | - | `GET /api/v1/products` |
| Filter by domain | 🔜 New | - | `GET /api/v1/products?domain_id=...` |
| Filter by category | 🔜 New | - | `GET /api/v1/products?category=...` |
| Search products | 🔜 New | - | `GET /api/v1/products` |
| Create new product | 🔜 New | - | `POST /api/v1/products` |
| Navigate to product detail | 🔜 New | - | - |

---

### `/views/product/ProductDetail.tsx` → Product Detail (NEW)

| Tab | Functionality | Status | User Story | API Endpoint |
|-----|--------------|--------|------------|--------------|
| **Overview** | View product summary | 🔜 New | - | `GET /api/v1/products/:id` |
| | View product KPI summary | 🔜 New | US-PROD-KPI-001 | `GET /api/v1/kpi-alignments?target_type=product` |
| | View product OKR summary | 🔜 New | US-PROD-OKR-001 | `GET /api/v1/okr-performance?product_id=...` |
| **KPIs** | View product KPIs | 🔜 New | US-PROD-KPI-001 | `GET /api/v1/kpi-alignments?target_type=product` |
| | Create product KPI | 🔜 New | US-PROD-KPI-001 | `POST /api/v1/kpis` |
| | Edit product KPI | 🔜 New | US-PROD-KPI-001 | `PATCH /api/v1/kpis/:id` |
| | Link to org KPIs | 🔜 New | US-PROD-KPI-001 | `POST /api/v1/kpi-alignments` |
| | Link to domain KPIs | 🔜 New | US-PROD-KPI-001 | `POST /api/v1/kpi-alignments` |
| | Set product targets | 🔜 New | US-PROD-KPI-001 | `POST /api/v1/kpi-alignments` |
| | View KPI performance | 🔜 New | US-PROD-MON-001 | `GET /api/v1/kpi-measurements` |
| **OKRs** | View product OKR cycles | 🔜 New | US-PROD-OKR-001 | `GET /api/v1/okr-directives?product_id=...` |
| | Create product OKR cycle | 🔜 New | US-PROD-OKR-001 | `POST /api/v1/okr-directives` |
| | Link to domain OKR cycle | 🔜 New | US-PROD-OKR-001 | `POST /api/v1/okr-directive-link` |
| | View product objectives | 🔜 New | US-PROD-OKR-001 | `GET /api/v1/okr-directives/:id` |
| | Create product objective | 🔜 New | US-PROD-OKR-001 | - |
| | View product KRs | 🔜 New | US-PROD-OKR-001 | `GET /api/v1/key-results?directive_id=...` |
| | Create product KR | 🔜 New | US-PROD-OKR-001 | `POST /api/v1/key-results` |
| | Link KR to domain KR | 🔜 New | US-PROD-OKR-001 | `POST /api/v1/okr-kr-link` |
| | Link KR to product KPI | 🔜 New | US-PROD-OKR-001 | `POST /api/v1/okr-kr-kpi-link` |
| | Update KR progress | 🔜 New | US-PROD-MON-001 | `PATCH /api/v1/key-results/:id` |
| **Roll-Down** | Select features for OKR | 🔜 New | US-PROD-ROLL-001 | `POST /api/v1/roll-down/feature` |
| | Set feature weights | 🔜 New | US-PROD-ROLL-001 | `POST /api/v1/roll-down/feature` |
| | Define feature milestones | 🔜 New | US-PROD-ROLL-001 | `POST /api/v1/roll-down/feature` |
| | Assign ownership | 🔜 New | US-PROD-ROLL-001 | `POST /api/v1/roll-down/feature` |
| | Validate roll-down | 🔜 New | US-PROD-ROLL-001 | - |
| **Features** | View features | 🔜 New | US-PROD-ROLL-001 | `GET /api/v1/features?product_id=...` |
| | View feature progress | 🔜 New | US-PROD-MON-001 | `GET /api/v1/features/:id` |
| | Update feature status | 🔜 New | US-PROD-MON-001 | `PATCH /api/v1/features/:id` |
| **Performance** | View KPI dashboard | 🔜 New | US-PROD-MON-001 | `GET /api/v1/kpi-measurements` |
| | View OKR performance board | 🔜 New | US-PROD-MON-001 | `GET /api/v1/okr-performance?product_id=...` |
| | Track feature delivery | 🔜 New | US-PROD-MON-001 | `GET /api/v1/features?product_id=...` |
| | Identify underperforming features | 🔜 New | US-PROD-MON-001 | `GET /api/v1/features?product_id=...` |

---

### `/views/product/Portfolio.tsx` → Product Portfolio (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| View product portfolio | 🔜 New | US-PROD-MON-001 | `GET /api/v1/product/portfolio` |
| View product KPIs | 🔜 New | US-PROD-MON-001 | `GET /api/v1/kpi-alignments?target_type=product` |
| View product OKRs | 🔜 New | US-PROD-MON-001 | `GET /api/v1/okr-performance?product_id=...` |
| Compare product performance | 🔜 New | US-PROD-MON-001 | `GET /api/v1/product/portfolio` |
| Allocate resources | 🔜 New | US-PROD-MON-001 | `POST /api/v1/product/allocation` |
| Make investment decisions | 🔜 New | US-PROD-MON-001 | `POST /api/v1/product/decision` |
| Retire/sunset products | 🔜 New | US-PROD-MON-001 | `DELETE /api/v1/products/:id` |
| Generate portfolio reports | 🔜 New | US-PROD-MON-001 | `POST /api/v1/reports/portfolio` |

---

## Analytics Views

### `/views/analytics/Overview.tsx` → Analytics Overview

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View KPI analytics | 🔜 Enhance | US-CROSS-003 | KPI performance analytics |
| View OKR analytics | 🔜 Enhance | US-CROSS-003 | OKR progress analytics |
| View roll-down analytics | 🔜 Enhance | US-CROSS-003 | Contribution analytics |
| Generate reports | 🔜 New | US-CROSS-003 | Report generation |
| Export data | 🔜 New | US-CROSS-003 | Data export |

---

### `/views/analytics/Matrix.tsx` → Analytics Matrix

| Functionality | Status | User Story | Description |
|--------------|--------|------------|-------------|
| View KPI roll-down matrix | 🔜 Enhance | US-EXEC-ROLL-001 | Domain contribution matrix |
| View OKR roll-down matrix | 🔜 Enhance | US-EXEC-ROLL-002 | Domain OKR matrix |
| View journey contribution matrix | 🔜 Enhance | US-DOM-ROLL-002 | Journey-level matrix |
| View activity contribution matrix | 🔜 Enhance | US-DOM-ROLL-002 | Activity-level matrix |
| Filter and drill down | 🔜 Enhance | US-CROSS-003 | Interactive filtering |

---

## Cross-Cutting Views

### `/views/analytics/Reports.tsx` → Reports (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| Generate KPI report | 🔜 New | US-CROSS-003 | `POST /api/v1/reports/kpi` |
| Generate OKR report | 🔜 New | US-CROSS-003 | `POST /api/v1/reports/okr` |
| Generate roll-down report | 🔜 New | US-CROSS-003 | `POST /api/v1/reports/roll-down` |
| Customize report parameters | 🔜 New | US-CROSS-003 | `POST /api/v1/reports/...` |
| Export PDF | 🔜 New | US-CROSS-003 | `GET /api/v1/reports/:id?format=pdf` |
| Export CSV | 🔜 New | US-CROSS-003 | `GET /api/v1/reports/:id?format=csv` |
| Export Excel | 🔜 New | US-CROSS-003 | `GET /api/v1/reports/:id?format=xlsx` |
| Schedule recurring reports | 🔜 New | US-CROSS-003 | `POST /api/v1/reports/schedule` |

---

### `/views/notifications/Settings.tsx` → Notification Settings (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| Subscribe to KPI alerts | 🔜 New | US-CROSS-002 | `POST /api/v1/notifications/subscriptions` |
| Subscribe to OKR alerts | 🔜 New | US-CROSS-002 | `POST /api/v1/notifications/subscriptions` |
| Subscribe to roll-down alerts | 🔜 New | US-CROSS-002 | `POST /api/v1/notifications/subscriptions` |
| Configure notification preferences | 🔜 New | US-CROSS-002 | `PATCH /api/v1/notifications/settings` |
| View notification history | 🔜 New | US-CROSS-002 | `GET /api/v1/notifications` |
| Mark notifications as read | 🔜 New | US-CROSS-002 | `PATCH /api/v1/notifications/:id` |

---

### `/views/approvals/Queue.tsx` → Approval Queue (NEW)

| Functionality | Status | User Story | API Endpoint |
|--------------|--------|------------|--------------|
| View pending approvals | 🔜 New | US-CROSS-001 | `GET /api/v1/approvals` |
| View KPI approval requests | 🔜 New | US-CROSS-001 | `GET /api/v1/approvals?type=kpi` |
| View OKR approval requests | 🔜 New | US-CROSS-001 | `GET /api/v1/approvals?type=okr` |
| Approve request | 🔜 New | US-CROSS-001 | `PATCH /api/v1/approvals/:id` |
| Reject request | 🔜 New | US-CROSS-001 | `PATCH /api/v1/approvals/:id` |
| View approval history | 🔜 New | US-CROSS-001 | `GET /api/v1/approvals/:id/history` |
| Configure approval rules | 🔜 New | US-CROSS-001 | `POST /api/v1/approvals/rules` |

---

## Component Reuse

### Shared Components

| Component | Used In Views | Status |
|-----------|---------------|--------|
| `KpiCrud` | DomainDetail, ProgramDetail, ProductDetail | ✅ Existing |
| `OkrCrud` | DomainDetail, ProgramDetail, ProductDetail | ✅ Existing |
| `OkrPerformanceBoard` | DomainDetail, ProgramDetail, ProductDetail | ✅ Existing |
| `KpiDashboard` | DomainDetail, ProgramDetail, ProductDetail | ✅ Existing |
| `RollDownMatrix` | Executive Roll-Down, Domain Roll-Down | 🔜 New |
| `KpiAlignmentForm` | DomainDetail, ProgramDetail, ProductDetail | 🔜 New |
| `OkrKrLinkForm` | DomainDetail, ProgramDetail, ProductDetail | 🔜 New |
| `PerformanceSummaryCards` | All Performance tabs | 🔜 New |
| `ApprovalWorkflow` | All KPI/OKR creation forms | 🔜 New |
| `NotificationSettings` | All detail views | 🔜 New |
| `ReportGenerator` | Analytics views | 🔜 New |

---

## Summary Table

| View | New/Enhance | Total Features | Existing | New | Phase |
|------|-------------|-----------------|---------|-----|-------|
| `/views/exec/Transform.tsx` | Enhance | 6 | 2 | 4 | Phase 1 |
| `/views/exec/KpiManagement.tsx` | New | 14 | 0 | 14 | Phase 1 |
| `/views/exec/OkrManagement.tsx` | New | 18 | 0 | 18 | Phase 1 |
| `/views/exec/RollDown.tsx` | New | 15 | 0 | 15 | Phase 2 |
| `/views/exec/Finance.tsx` | Enhance | 4 | 0 | 4 | Phase 3 |
| `/views/exec/Ops.tsx` | Enhance | 4 | 0 | 4 | Phase 3 |
| `/views/exec/People.tsx` | Enhance | 4 | 0 | 4 | Phase 3 |
| `/views/exec/Risk.tsx` | Enhance | 4 | 0 | 4 | Phase 3 |
| `/views/explorer/DomainDetail.tsx` | Enhance | 28 | 10 | 18 | Phase 1-2 |
| `/views/explorer/RollDown.tsx` | New | 12 | 0 | 12 | Phase 2 |
| `/views/explorer/JourneyDetailSlide.tsx` | Enhance | 5 | 1 | 4 | Phase 2 |
| `/views/explorer/Activities.tsx` | Enhance | 5 | 0 | 5 | Phase 2 |
| `/views/program/ProgramList.tsx` | New | 6 | 0 | 6 | Phase 4 |
| `/views/program/ProgramDetail.tsx` | New | 24 | 0 | 24 | Phase 4 |
| `/views/product/ProductList.tsx` | New | 6 | 0 | 6 | Phase 5 |
| `/views/product/ProductDetail.tsx` | New | 22 | 0 | 22 | Phase 5 |
| `/views/product/Portfolio.tsx` | New | 7 | 0 | 7 | Phase 5 |
| `/views/analytics/Overview.tsx` | Enhance | 5 | 0 | 5 | Phase 6 |
| `/views/analytics/Matrix.tsx` | Enhance | 5 | 0 | 5 | Phase 6 |
| `/views/analytics/Reports.tsx` | New | 8 | 0 | 8 | Phase 6 |
| `/views/notifications/Settings.tsx` | New | 6 | 0 | 6 | Phase 6 |
| `/views/approvals/Queue.tsx` | New | 7 | 0 | 7 | Phase 6 |
| **Total** | - | **215** | **13** | **202** | - |

---

## Implementation Checklist by Phase

### Phase 1: Foundation (47 features)
- [ ] `/views/exec/KpiManagement.tsx` (14 features)
- [ ] `/views/exec/OkrManagement.tsx` (18 features)
- [ ] `/views/exec/Transform.tsx` enhancements (4 features)
- [ ] `/views/explorer/DomainDetail.tsx` KPI/OKR tabs (11 features)

### Phase 2: Roll-Down (55 features)
- [ ] `/views/exec/RollDown.tsx` (15 features)
- [ ] `/views/explorer/DomainDetail.tsx` Roll-Down tab (7 features)
- [ ] `/views/explorer/RollDown.tsx` (12 features)
- [ ] `/views/explorer/JourneyDetailSlide.tsx` enhancements (4 features)
- [ ] `/views/explorer/Activities.tsx` enhancements (5 features)
- [ ] RollDownMatrix component (new)

### Phase 3: Monitoring (16 features)
- [ ] `/views/exec/Finance.tsx` enhancements (4 features)
- [ ] `/views/exec/Ops.tsx` enhancements (4 features)
- [ ] `/views/exec/People.tsx` enhancements (4 features)
- [ ] `/views/exec/Risk.tsx` enhancements (4 features)

### Phase 4: Program Level (30 features)
- [ ] `/views/program/ProgramList.tsx` (6 features)
- [ ] `/views/program/ProgramDetail.tsx` (24 features)

### Phase 5: Product Level (35 features)
- [ ] `/views/product/ProductList.tsx` (6 features)
- [ ] `/views/product/ProductDetail.tsx` (22 features)
- [ ] `/views/product/Portfolio.tsx` (7 features)

### Phase 6: Cross-Cutting (32 features)
- [ ] `/views/analytics/Overview.tsx` enhancements (5 features)
- [ ] `/views/analytics/Matrix.tsx` enhancements (5 features)
- [ ] `/views/analytics/Reports.tsx` (8 features)
- [ ] `/views/notifications/Settings.tsx` (6 features)
- [ ] `/views/approvals/Queue.tsx` (7 features)
- [ ] Shared components (1 feature)
