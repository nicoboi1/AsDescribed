import { useEffect, useRef } from "react";
import * as d3 from "d3";
import s from "./PhaseClock.module.css";
import { PHASES, type Phase } from "../types";
import { PHASE_COLOR, PHASE_LABEL } from "../lib";

interface Props {
  current: Phase;
}

export function PhaseClock({ current }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const size = 300;
    const r = size / 2;
    const inner = 78;
    const outer = 132;
    const g = svg
      .attr("viewBox", `0 0 ${size} ${size}`)
      .append("g")
      .attr("transform", `translate(${r},${r})`);

    const pie = d3
      .pie<string>()
      .value(1)
      .sort(null)
      .padAngle(0.028)
      .startAngle(-Math.PI / 2);

    const arc = d3
      .arc<d3.PieArcDatum<string>>()
      .innerRadius(inner)
      .outerRadius(outer)
      .cornerRadius(3);

    const arcs = pie(PHASES as unknown as string[]);
    const curIdx = PHASES.indexOf(current as (typeof PHASES)[number]);

    g.selectAll("path.seg")
      .data(arcs)
      .join("path")
      .attr("class", "seg")
      .attr("d", arc as never)
      .attr("fill", (d, i) =>
        i === curIdx ? PHASE_COLOR[d.data] : "#e3d9c4"
      )
      .attr("stroke", (d, i) =>
        i === curIdx ? PHASE_COLOR[d.data] : "rgba(26,26,26,0.10)"
      )
      .attr("stroke-width", (_, i) => (i === curIdx ? 2 : 1))
      .style("opacity", (_, i) => (i === curIdx ? 1 : 0.72))
      .style("transition", "all 0.5s ease");

    // tick numerals around the ring
    g.selectAll("text.num")
      .data(arcs)
      .join("text")
      .attr("class", "num")
      .attr("transform", (d) => {
        const c = arc.centroid(d);
        return `translate(${c[0]},${c[1]})`;
      })
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-family", "var(--mono)")
      .attr("font-size", 10)
      .attr("fill", (_d, i) => (i === curIdx ? "#fffdf8" : "rgba(26,26,26,0.45)"))
      .attr("font-weight", (_, i) => (i === curIdx ? 600 : 400))
      .text((_, i) => i + 1);

    // center label
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("font-family", "var(--mono)")
      .attr("font-size", 9)
      .attr("letter-spacing", "0.18em")
      .attr("fill", "rgba(26,26,26,0.42)")
      .text("PHASE");

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.1em")
      .attr("font-family", "var(--serif)")
      .attr("font-size", 18)
      .attr("font-weight", 600)
      .attr("fill", PHASE_COLOR[current] ?? "#1a1a1a")
      .text(curIdx >= 0 ? `${curIdx + 1}/9` : "—");
  }, [current]);

  return (
    <div className={s.wrap}>
      <svg ref={ref} className={s.svg} />
      <div className={s.legend}>
        {PHASES.map((p, i) => (
          <span
            key={p}
            className={`${s.item} ${p === current ? s.active : ""}`}
          >
            <i style={{ background: PHASE_COLOR[p] }} />
            <em>{i + 1}</em>
            {PHASE_LABEL[p]}
          </span>
        ))}
      </div>
    </div>
  );
}
