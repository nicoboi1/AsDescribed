import { useEffect, useRef } from "react";
import * as d3 from "d3";
import s from "./MilestoneScales.module.css";
import type { MilestoneView } from "../types";

interface Props {
  milestones: MilestoneView[];
}

function statusOf(m: MilestoneView): { label: string; fill: string } {
  if (m.released) return { label: "released", fill: "#b8860b" };
  if (m.requested_release) return { label: "requested", fill: "#9a7b12" };
  if (m.witnessed_ok) return { label: "witnessed", fill: "#6b8f4e" };
  return { label: "declared", fill: "#c9bca0" };
}

export function MilestoneScales({ milestones }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (!milestones.length) return;

    const W = 300;
    const H = 230;
    const beamY = 36;
    const m = [...milestones].sort((a, b) => a.idx - b.idx);
    const x = d3
      .scaleBand<number>()
      .domain(m.map((d) => d.idx))
      .range([24, W - 24])
      .padding(0.32);

    const maxBps = Math.max(10000, d3.max(m, (d) => d.share_bps) ?? 0);
    const hScale = d3.scaleLinear().domain([0, maxBps]).range([14, 150]);

    svg.attr("viewBox", `0 0 ${W} ${H}`);

    // beam
    svg
      .append("rect")
      .attr("x", 14)
      .attr("y", beamY - 4)
      .attr("width", W - 28)
      .attr("height", 7)
      .attr("rx", 3)
      .attr("fill", "var(--brass)");
    svg
      .append("circle")
      .attr("cx", W / 2)
      .attr("cy", beamY)
      .attr("r", 6)
      .attr("fill", "var(--brass-dim)");

    const g = svg
      .selectAll("g.weight")
      .data(m)
      .join("g")
      .attr("class", "weight");

    // hanging chain
    g.append("line")
      .attr("x1", (d) => (x(d.idx) ?? 0) + x.bandwidth() / 2)
      .attr("y1", beamY)
      .attr("x2", (d) => (x(d.idx) ?? 0) + x.bandwidth() / 2)
      .attr("y2", beamY + 14)
      .attr("stroke", "#5e4708")
      .attr("stroke-width", 1.2);

    // weight block (height ∝ share_bps)
    g.append("rect")
      .attr("x", (d) => x(d.idx) ?? 0)
      .attr("y", beamY + 14)
      .attr("width", x.bandwidth())
      .attr("height", 4)
      .attr("rx", 2)
      .attr("fill", (d) => statusOf(d).fill)
      .attr("stroke", "rgba(26,26,26,0.25)")
      .attr("stroke-width", 1)
      .transition()
      .duration(650)
      .ease(d3.easeCubicOut)
      .attr("height", (d) => hScale(d.share_bps));

    // bps label
    g.append("text")
      .attr("x", (d) => (x(d.idx) ?? 0) + x.bandwidth() / 2)
      .attr("y", beamY + 14 + 152)
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--mono)")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#1a1a1a")
      .text((d) => `${(d.share_bps / 100).toFixed(0)}%`);

    // idx label
    g.append("text")
      .attr("x", (d) => (x(d.idx) ?? 0) + x.bandwidth() / 2)
      .attr("y", beamY + 14 + 168)
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--mono)")
      .attr("font-size", 9)
      .attr("letter-spacing", "0.1em")
      .attr("fill", "rgba(26,26,26,0.5)")
      .text((d) => `M${d.idx}`);
  }, [milestones]);

  const total = milestones.reduce((a, m) => a + m.share_bps, 0);

  return (
    <div className={s.wrap}>
      {milestones.length === 0 ? (
        <div className="empty">No milestones declared yet.</div>
      ) : (
        <>
          <svg ref={ref} className={s.svg} />
          <div className={s.foot}>
            <span className="mono">
              {milestones.length} tranche{milestones.length > 1 ? "s" : ""}
            </span>
            <span
              className="mono"
              style={{ color: total === 10000 ? "#3a6b3a" : "var(--brass-dim)" }}
            >
              Σ {(total / 100).toFixed(0)}% allocated
            </span>
          </div>
        </>
      )}
    </div>
  );
}
