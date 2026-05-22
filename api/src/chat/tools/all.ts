// Auto-discovery barrel for all chat tools.
// T-12..T-15 each append one line per tool below; the registry imports * from
// this file and assembles itself by reading the TOOL_DEF named export.
//
// New tool? Add the file under api/src/chat/tools/<name>.ts (exporting `TOOL_DEF`),
// then add one re-export line below — no edits to registry.ts required.

export { TOOL_DEF as list_domains } from "./list-domains";
export { TOOL_DEF as get_domain } from "./get-domain";
export { TOOL_DEF as get_journey } from "./get-journey";
export { TOOL_DEF as get_activity } from "./get-activity";
export { TOOL_DEF as list_nodes_by_label } from "./list-nodes-by-label";
export { TOOL_DEF as neighbors } from "./neighbors";
export { TOOL_DEF as find_path } from "./find-path";
export { TOOL_DEF as aggregate } from "./aggregate";
export { TOOL_DEF as sla_hotspots } from "./sla-hotspots";
export { TOOL_DEF as handoff_matrix } from "./handoff-matrix";
export { TOOL_DEF as sod_register } from "./sod-register";
export { TOOL_DEF as ai_candidates } from "./ai-candidates";
export { TOOL_DEF as initiative_impact } from "./initiative-impact";
export { TOOL_DEF as cypher } from "./cypher";
export { TOOL_DEF as describe_schema } from "./describe-schema";
