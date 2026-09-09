import { Box, Building2, Compass, Landmark, Layers, Map, Quote, TreePalm, Wand2 } from "lucide-react";
import type { ToolId } from "@tools/registry";

/** Single icon-per-tool map shared by marketing showcase and studio rail. */
export const TOOL_ICONS: Record<ToolId, typeof Compass> = {
  exterior: Landmark,
  interior: Building2,
  sketch: Quote,
  masterplan: Map,
  landscape: TreePalm,
  staging: Layers,
  enhancer: Wand2,
  floorplan: Compass,
  engineering: Box,
};
