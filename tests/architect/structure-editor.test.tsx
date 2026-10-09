import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StructureEditor } from "../../components/architect/StructureEditor";
import { DEFAULT_WALL_MESH_PRESET } from "../../lib/architect/wall-mesh";
import type { BuildingProposal } from "../../lib/architect/building-proposal";

describe("StructureEditor geometric clash gate", () => {
  it("keeps a beam edit staged when it intersects a window below", async () => {
    const project = JSON.parse(readFileSync("examples/architect-two-floor-demo.json", "utf8"));
    const proposal = project.conceptProposal as BuildingProposal;
    for (const id of ["c2", "c4"]) proposal.structure!.columns.find((column) => column.id === id)!.position.x = 11.85;
    proposal.structure!.columns.find((column) => column.id === "c4")!.position.y = 12;
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<StructureEditor proposal={proposal} locale="en" wallMeshPreset={DEFAULT_WALL_MESH_PRESET}
      onApply={onApply} onCancel={vi.fn()} />);
    const b6Depth = within(screen.getByRole("region", { name: "Beams" })).getAllByLabelText("Depth (m)")[5]!;
    await user.clear(b6Depth);
    await user.type(b6Depth, "1");
    await user.click(screen.getByRole("button", { name: "Validate and apply grid" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Beam crosses an opening in the storey below");
    expect(onApply).not.toHaveBeenCalled();

    await user.clear(b6Depth);
    await user.type(b6Depth, "0.45");
    await user.click(screen.getByRole("button", { name: "Validate and apply grid" }));
    expect(onApply).toHaveBeenCalledOnce();
  });
});
