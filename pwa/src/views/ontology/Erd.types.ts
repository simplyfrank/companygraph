/**
 * ERD (Entity Relationship Diagram) type definitions
 * Centralized types for the ontology ERD canvas
 */

import type { OntologyLabelRow, OntologyEdgeTypeRow } from "../../api";

/** Position in SVG coordinate space */
export interface ErdPosition {
  x: number;
  y: number;
}

/** Entity dimensions */
export interface ErdSize {
  width: number;
  height: number;
}

/** Layout state for the ERD canvas */
export interface ErdLayout {
  positions: Record<string, ErdPosition>;
  sizes: Record<string, ErdSize>;
}

/** Derived edge from ontology edge type endpoints */
export interface ErdEdge {
  id: string;
  type: string;
  fromLabel: string;
  toLabel: string;
  source: OntologyEdgeTypeRow;
}

/** Viewport transform state */
export interface ErdViewport {
  zoom: number;
  pan: ErdPosition;
}

/** Selection state */
export interface ErdSelection {
  selectedNode: string | null;
  selectedEdge: number | null;
  hoverNode: string | null;
  selectedEntities: Set<string>;
}

/** Resize handle type */
export type ErdResizeHandle = 'se' | 'e' | 's';

/** Resize state */
export interface ErdResizeState {
  resizingEntity: string | null;
  resizeHandle: ErdResizeHandle | null;
  resizeStart: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

/** Drag state */
export interface ErdDragState {
  isDragging: boolean;
  draggedLabel: string | null;
  dragStartPositions: Record<string, ErdPosition>;
  dragStartMouse: ErdPosition | null;
}

/** Selection box state */
export interface ErdSelectionBox {
  isSelecting: boolean;
  selectionStart: ErdPosition | null;
  selectionBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

/** Pan state */
export interface ErdPanState {
  isPanning: boolean;
  panStart: ErdPosition | null;
}

/** Complete ERD state */
export interface ErdState extends ErdViewport, ErdSelection, ErdResizeState, ErdDragState, ErdSelectionBox, ErdPanState {
  didDrag: boolean;
}

/** Constants for ERD rendering */
export const ERD_CONSTANTS = {
  BOX_WIDTH: 160,
  BOX_HEADER_HEIGHT: 46,
  ATTR_ROW_HEIGHT: 14,
  ATTR_PADDING: 8,
  MIN_WIDTH: 120,
  MIN_HEIGHT: 80,
  SVG_VIEWBOX_WIDTH: 840,
  SVG_VIEWBOX_HEIGHT: 620,
} as const;
