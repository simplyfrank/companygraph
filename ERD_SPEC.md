# ERD Canvas — Full Alignment Spec

**Target:** `http://127.0.0.1:5173/#/ontology/erd`
**Owner:** ontology-manager
**Persona:** P1 · Maya (Ontology Author)
**Related User Stories:** OA-1.1, OA-1.2, OA-1.3, OA-1.4, OA-2.1, OA-2.2, OA-2.3, OA-3.1, OA-3.2, OA-3.3

---

## Current State Analysis

### What Exists (Erd.tsx)
- **Static SVG layout** with fixed positions for 6 node labels
- **Interactive selection** (click nodes/edges to inspect)
- **Dynamic box heights** based on attribute count
- **Right panel** showing selected node/edge details
- **Legend** for required/optional attributes
- **Real-time data** from `api.stats()` and `api.ontology.listLabels()`

### What's Missing (vs Wireframe)
1. **Drag-and-drop entity positioning** — entities are currently fixed
2. **Auto-layout algorithm** — no re-flow capability
3. **Entity grouping** — no subdomain/domain containers
4. **Zoom and pan controls** — no canvas navigation
5. **Add entity functionality** — read-only view
6. **Add/edit edge functionality** — read-only view
7. **Export (PNG/SVG)** — no export capability
8. **Save model** — no persistence of layout changes
9. **Deprecation workflow** — no deprecation UI
10. **Version rollback UI** — no rollback integration

---

## Feature Specification

### 1. Drag-and-Drop Entity Positioning

**User Story:** OA-2.1 (single readable view) — implicit need for visual organization

**Wireframe Reference:**
- Toolbar has "Select" tool (V key) with "Drag entities to move" tooltip
- Tip bar: "Drag card head to move"

**Implementation Plan:**

#### State Management
```typescript
interface EntityPosition {
  label: string;
  x: number;
  y: number;
}

const [positions, setPositions] = useState<Record<string, EntityPosition>>({
  // Initialize from POS constant, then persist to localStorage
});
```

#### Interaction Logic
- **Select tool active:** Mouse down on entity header → drag → update position state
- **Boundary constraints:** Keep entities within canvas bounds
- **Snap-to-grid:** Optional 10px grid snapping for alignment
- **Undo/redo:** Maintain position history stack

#### API Integration
- Persist positions to `localStorage` key `companygraph.erd.positions`
- On load, merge localStorage with default POS constants
- "Reset positions" button clears localStorage and reverts to defaults

#### Visual Feedback
- Cursor: `grab` on hover, `grabbing` during drag
- Shadow lift effect during drag
- Highlight connected edges during drag

---

### 2. Auto-Layout Algorithm

**User Story:** OA-2.1 (readable view) — automatic organization

**Wireframe Reference:**
- Toolbar has "Auto-layout" button with "Re-flow entities" tooltip

**Implementation Plan:**

#### Algorithm Options
1. **Force-directed layout** (d3-force or custom)
   - Nodes repel each other
   - Edges act as springs
   - Constrain to vertical hierarchy (Domain → Journey → Activity)

2. **Hierarchical layout** (dagre or custom)
   - Rank nodes by relationship depth
   - Align by columns
   - Minimize edge crossings

3. **Grid-based layout** (simplest)
   - Place nodes in a grid
   - Group by label type
   - Maintain edge direction

#### Recommended Approach
Use **hierarchical layout** with these rules:
- Domain nodes at top (y = 40)
- UserJourney nodes below (y = 170)
- Activity nodes below (y = 320)
- Role/System/Location at same level (y = 320)
- Location at bottom (y = 490)
- Horizontal spacing: auto-calculate based on canvas width

#### Animation
- Animate position changes over 300ms using CSS transitions
- Disable animation during drag operations

---

### 3. Entity Grouping (Subdomain/Domain)

**User Story:** OA-2.2 (external alignment) — optional grouping context

**Wireframe Reference:**
- "Group by" dropdown: None / Subdomain / Domain
- "Collapse all" / "Expand all" buttons (shown when grouping active)
- `<div class="erd-groups" id="erd-groups">` container

**Implementation Plan:**

#### Data Model
```typescript
interface Group {
  id: string;
  label: string;
  type: "subdomain" | "domain";
  entities: string[]; // label names
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}
```

#### Grouping Logic
- **None:** No grouping (current behavior)
- **Subdomain:** Group by `external_alignment.source` if present
- **Domain:** Group by parent domain (e.g., Operations, Strategy, Governance)

#### Visual Container
- Draw rounded rectangle around grouped entities
- Group header with collapse/expand toggle
- Dashed border for visual distinction
- Background tint: `var(--surface-2)`

#### Interaction
- Drag group header to move entire group
- Collapse hides entities, shows count badge
- Expand restores entity positions

---

### 4. Zoom and Pan Controls

**User Story:** PE-3.1 (interactive canvas) — navigation

**Wireframe Reference:**
- Zoom display: "100%"
- Zoom out (−), Zoom in (+), Reset (⤢) buttons
- "Pan" tool (H key) with "Hold space to pan" tooltip

**Implementation Plan:**

#### State Management
```typescript
const [zoom, setZoom] = useState(1);
const [pan, setPan] = useState({ x: 0, y: 0 });
```

#### Zoom Logic
- Range: 25% to 400%
- Increment: 25% per click
- Mouse wheel: delta-based zoom (optional)
- Zoom toward cursor position (advanced)

#### Pan Logic
- **Pan tool active:** Drag canvas to pan
- **Space key hold:** Temporarily enable pan
- **Middle mouse drag:** Pan regardless of tool
- Boundary constraints: Prevent panning entirely off-canvas

#### Visual Feedback
- Zoom display updates in real-time
- Cursor: `grab` / `grabbing` for pan
- Transform applied to canvas container via CSS `transform: translate(...) scale(...)`

---

### 5. Add Entity Functionality

**User Story:** OA-1.1 (add new node label) + OA-2.1 (readable view)

**Wireframe Reference:**
- "+ Entity" button in toolbar
- Opens entity creation dialog (likely modal or inline form)

**Implementation Plan:**

#### Creation Flow
1. Click "+ Entity" button
2. Open modal with form:
   - Label name (required, unique)
   - Description (required)
   - Usage example (required)
   - External alignment (optional)
   - Attribute schema (see §6)
3. Dry-run validation (OA-3.1)
4. Confirm → POST to `POST /api/v1/ontology/node-labels`
5. Refresh ERD canvas

#### Form Fields
```typescript
interface EntityCreateForm {
  name: string;           // e.g., "Product"
  description: string;    // Required per OA-2.1
  usage_example: string;   // Required per OA-2.1
  external_alignment?: Array<{ source: string; id: string }>;
  attributes: AttributeSchema[];
}
```

#### Validation
- Name must be unique (case-sensitive)
- Description and usage_example cannot be blank
- Attribute names must be unique within entity
- Required attributes enforced on existing data (OA-3.2)

#### API Integration
- Use `api.ontology.createNodeLabel(form)`
- Emit `ontology.changed` event (automatic via route)
- Handle 409 conflict (name exists)
- Handle 400 validation errors

---

### 6. Add/Edit Edge Functionality

**User Story:** OA-1.2 (add new edge type) + OA-1.3 (deprecate)

**Wireframe Reference:**
- "Connect" tool (C key) with "Drag from edge handles to connect" tooltip
- Tip bar: "Drag handle to connect"

**Implementation Plan:**

#### Connect Tool Flow
1. Activate "Connect" tool
2. Hover entity → show connection handles (4 corners)
3. Drag from handle to target entity
4. Open edge creation dialog:
   - Edge type name (required, unique)
   - From label (auto-filled from source)
   - To label (auto-filled from target)
   - Cardinality (optional: n:1, 1:n, n:n, 1:1)
   - Description (required)
   - Usage example (required)
5. Confirm → POST to `POST /api/v1/ontology/edge-types`
6. Draw edge on canvas

#### Edge Handles
- Show 4 small circles at entity corners when Connect tool active
- Highlight on hover
- Drag line from handle to cursor during drag
- Snap to target entity on hover

#### Edge Creation Form
```typescript
interface EdgeCreateForm {
  name: string;           // e.g., "USES_PRODUCT"
  from_label: string;     // Auto-filled
  to_label: string;       // Auto-filled
  cardinality?: string;   // Optional
  description: string;    // Required
  usage_example: string;  // Required
  allowed_pairs?: Array<{ from: string; to: string }>;
}
```

#### Self-Loop Edges
- Drag from handle back to same entity
- Mark as `curve: "self"` in EDGES array
- Render as curved line (current implementation supports this)

---

### 7. Export (PNG/SVG) Functionality

**User Story:** PE-3.2 (export current view) — re-used for ERD

**Wireframe Reference:**
- "Export" button in toolbar

**Implementation Plan:**

#### Export Options
- **PNG:** 1× and 2× resolution
- **SVG:** Vector format
- Filename: `companygraph-erd-YYYY-MM-DD-HHMMSS.{ext}`

#### PNG Export
- Use `html2canvas` or similar library
- Capture canvas container only (exclude toolbar/panel)
- Apply current zoom level
- Include background color

#### SVG Export
- Serialize SVG DOM to string
- Include CSS styles inline or as `<style>` block
- Include entity positions and attributes
- Download as `.svg` file

#### Implementation
```typescript
const handleExport = async (format: 'png' | 'svg') => {
  if (format === 'png') {
    const canvas = await html2canvas(erdCanvasRef.current);
    const link = document.createElement('a');
    link.download = `companygraph-erd-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } else {
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = `companygraph-erd-${timestamp}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }
};
```

---

### 8. Save Model Functionality

**User Story:** OA-1.4 (version the ontology) + OA-3.3 (audit log)

**Wireframe Reference:**
- "Save model" button (primary style) in toolbar

**Implementation Plan:**

#### What Gets Saved
- Entity positions (layout state)
- Grouping state (if any)
- Zoom/pan state
- Schema changes (already persisted via API)

#### Save Flow
1. Click "Save model"
2. Show confirmation dialog:
   - "Save current layout and schema changes?"
   - Show summary: "X entities repositioned, Y edges added"
3. Confirm → commit to version history
4. Show success toast with version ID

#### API Integration
- Layout state → `localStorage` (immediate)
- Schema changes → already handled by individual CRUD operations
- Version history → automatic via `POST /api/v1/ontology/node-labels` etc.

#### Version Rollback Integration
- Add "Rollback to version" button in versions view
- On rollback, restore positions from that version's metadata
- Navigate to ERD canvas with restored state

---

### 9. Deprecation Workflow

**User Story:** OA-1.3 (deprecate label or edge type)

**Wireframe Reference:**
- Not explicitly shown in ERD wireframe, but implied in editor view
- Should be accessible from entity/edge detail panel

**Implementation Plan:**

#### Deprecation Flow
1. Right-click entity or edge → context menu
2. Select "Deprecate"
3. Show deprecation dialog:
   - "Deprecate [label]?"
   - "This will mark the type as deprecated but existing data will remain."
   - "Removal requires a migration step."
4. Confirm → PATCH to `PATCH /api/v1/ontology/node-labels/:name` with `deprecated_at: new Date().toISOString()`
5. Visual feedback:
   - Gray out entity/edge
   - Show "Deprecated" badge
   - Add warning stripe to header

#### Visual Indicators
- Deprecated entities: reduced opacity, grayscale
- Warning badge: "Deprecated · [date]"
- Tooltip: "Deprecated on [date]. Writes allowed but discouraged."

#### Removal Flow
- Only allowed if no existing nodes/edges use the type
- Check via API before allowing removal
- If data exists, show error: "Cannot remove: X existing nodes. Create migration first."

---

### 10. Version Rollback UI

**User Story:** OA-1.4 (version the ontology)

**Wireframe Reference:**
- Rollback is likely in the "versions" tab, but ERD should integrate with it

**Implementation Plan:**

#### Rollback Integration
- When rollback is triggered from versions view:
  1. Fetch version metadata (includes positions if saved)
  2. Restore schema via `POST /api/v1/ontology/rollback/:version_id`
  3. Restore layout from version metadata
  4. Navigate to ERD canvas
  5. Show toast: "Rolled back to version [id]"

#### Layout Versioning
- Save positions as part of version metadata:
```typescript
interface VersionMetadata {
  schema: OntologySchema;
  layout: {
    positions: Record<string, { x: number; y: number }>;
    zoom: number;
    pan: { x: number; y: number };
    groups?: Group[];
  };
}
```

#### Conflict Resolution
- If current layout differs from version:
  - Ask user: "Restore layout from version or keep current?"
  - Default: restore layout (full rollback)

---

## Implementation Priority

### Phase 1: Core Interactivity (High Priority)
1. **Drag-and-drop positioning** — foundational for all other features
2. **Zoom and pan controls** — required for larger schemas
3. **Add entity functionality** — core CRUD capability

### Phase 2: Schema Management (High Priority)
4. **Add/edit edge functionality** — complete CRUD
5. **Save model functionality** — persistence
6. **Auto-layout algorithm** — usability

### Phase 3: Advanced Features (Medium Priority)
7. **Entity grouping** — organization
8. **Export functionality** — documentation/sharing
9. **Deprecation workflow** — lifecycle management

### Phase 4: Polish (Low Priority)
10. **Version rollback UI** — advanced workflow
11. **Undo/redo** — UX enhancement
12. **Keyboard shortcuts** — power user features

---

## Technical Considerations

### Performance
- Canvas should render ≤ 50 entities at 60fps
- Use CSS transforms for zoom/pan (GPU-accelerated)
- Debounce position saves to localStorage
- Virtualize entity list if > 100 entities

### Accessibility
- Keyboard navigation: Tab between entities, Enter to select
- Screen reader: Announce entity names and counts
- High contrast mode: Ensure colors meet WCAG AA
- Focus indicators: Visible outline on selected entities

### Browser Compatibility
- Target: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
- Fallback for drag-and-drop: Use mouse events if Pointer Events unavailable
- SVG export: Ensure XMLSerializer is available

### Error Handling
- API failures: Show toast with error message
- Validation errors: Inline form errors
- Network errors: Retry with exponential backoff
- LocalStorage quota: Handle quota exceeded gracefully

---

## Testing Strategy

### Unit Tests
- Position state management
- Zoom/pan calculations
- Grouping logic
- Auto-layout algorithm

### Integration Tests
- Add entity → API call → canvas update
- Drag entity → localStorage persistence
- Export → file generation
- Rollback → schema + layout restoration

### E2E Tests (Playwright)
- Drag entity to new position
- Create new entity via form
- Connect two entities with edge
- Export to PNG/SVG
- Rollback to previous version

---

## Open Questions

1. **Library choice for drag-and-drop:**
   - Option A: Custom implementation (lightweight, full control)
   - Option B: react-dnd (mature, React-specific)
   - Option C: d3-drag (part of d3 ecosystem)

2. **Library choice for auto-layout:**
   - Option A: dagre (hierarchical, battle-tested)
   - Option B: d3-force (flexible, force-directed)
   - Option C: Custom algorithm (simple, predictable)

3. **Position persistence scope:**
   - Option A: Per-user (localStorage)
   - Option B: Shared (server-side, per-version)
   - Option C: Hybrid (local drafts, server commits)

4. **Edge routing:**
   - Option A: Straight lines (current)
   - Option B: Orthogonal (right angles)
   - Option C: Curved (bezier)

---

## Success Criteria

- [ ] All entities can be dragged and repositioned
- [ ] Zoom (25%-400%) and pan work smoothly
- [ ] New entities can be created via form
- [ ] New edges can be created via connect tool
- [ ] Layout can be auto-arranged
- [ ] Entities can be grouped by subdomain/domain
- [ ] Canvas can be exported as PNG/SVG
- [ ] Layout state persists across sessions
- [ ] Entities can be deprecated with visual feedback
- [ ] Version rollback restores schema + layout
- [ ] Performance: 60fps with 50 entities
- [ ] Accessibility: Keyboard navigation works
- [ ] All OA-1.x, OA-2.x, OA-3.x stories addressed
