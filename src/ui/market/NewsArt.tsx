import { useId } from "react";
import { CHART_COLORS } from "../components/ChartParts";
import { ART_H, ART_W, COIN_BASE_Y, COIN_STEP, artKindFor, barColumns, chartSeries, circuit, coinStacks, glowSpot, globe, makeRng, mountains, type ArtKind } from "./news-art";
import s from "./market.module.css";

const LIME = CHART_COLORS[0];
const BLUE = CHART_COLORS[3];

function Motif({ kind, rng, gradId }: { kind: ArtKind; rng: ReturnType<typeof makeRng>; gradId: string }) {
  switch (kind) {
    case "markets": {
      const c = chartSeries(rng);
      return (
        <>
          <path d={c.area} fill={`url(#${gradId})`} />
          <path d={c.line} className={s.artLine} />
          <circle cx={c.last[0]} cy={c.last[1]} r={4} className={s.artDot} />
          <circle cx={c.last[0]} cy={c.last[1]} r={9} className={s.artHalo} />
        </>
      );
    }
    case "economy": {
      const bars = barColumns(rng);
      return (
        <>
          {bars.map((b) => (
            <rect key={b.x} x={b.x} y={b.y} width={b.w} height={b.h} rx={3} className={b.hot ? s.artBarHot : s.artBar} />
          ))}
          <path d={bars.map((b, i) => `${i ? "L" : "M"}${b.x + b.w / 2} ${b.y - 10}`).join(" ")} className={s.artLineThin} />
        </>
      );
    }
    case "currency":
      return (
        <>
          {coinStacks(rng).map((st) =>
            Array.from({ length: st.count }, (_, i) => {
              const cy = COIN_BASE_Y - i * COIN_STEP;
              const top = i === st.count - 1;
              return (
                <g key={`${st.cx}-${i}`}>
                  <path d={`M${st.cx - st.rx} ${cy} v${COIN_STEP - 2} a${st.rx} ${st.ry} 0 0 0 ${st.rx * 2} 0 v-${COIN_STEP - 2}`} className={s.artCoinSide} />
                  <ellipse cx={st.cx} cy={cy} rx={st.rx} ry={st.ry} className={top ? s.artCoinTop : s.artCoinFace} />
                  {top ? <ellipse cx={st.cx} cy={cy} rx={st.rx * 0.55} ry={st.ry * 0.55} className={s.artCoinRing} /> : null}
                </g>
              );
            }),
          )}
        </>
      );
    case "tech": {
      const c = circuit(rng);
      return (
        <>
          {c.pins.map((p) => (
            <path key={p.d} d={p.d} className={s.artLineThin} />
          ))}
          {c.nodes.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} className={s.artDot} />
          ))}
          <rect x={c.chip.x} y={c.chip.y} width={c.chip.w} height={c.chip.h} rx={8} className={s.artChip} />
          <rect x={c.chip.x + 20} y={c.chip.y + 18} width={c.chip.w - 40} height={c.chip.h - 36} rx={4} className={s.artChipCore} />
        </>
      );
    }
    case "armenia": {
      const m = mountains(rng);
      return (
        <>
          <circle cx={m.sun.cx} cy={m.sun.cy} r={m.sun.r} className={s.artSun} />
          <path d={m.back} className={s.artRidgeBack} />
          <path d={m.front} className={s.artRidgeFront} />
        </>
      );
    }
    case "world": {
      const g = globe(rng);
      return (
        <>
          <circle cx={g.cx} cy={g.cy} r={g.r} className={s.artGlobe} />
          {g.meridians.map((rx) => (
            <ellipse key={rx} cx={g.cx} cy={g.cy} rx={rx} ry={g.r} className={s.artGrid} />
          ))}
          {g.latitudes.map((l) => (
            <line key={l.y} x1={g.cx - l.dx} x2={g.cx + l.dx} y1={l.y} y2={l.y} className={s.artGrid} />
          ))}
          {g.arcs.map((d) => (
            <path key={d} d={d} className={s.artLineThin} />
          ))}
          {g.points.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} className={s.artDot} />
          ))}
        </>
      );
    }
  }
}

/** Decorative drawing used when an article has no (working) image. Same input -> same picture. */
export function NewsArt({ seed, category, region }: { seed: string; category: string; region?: string }) {
  const kind = artKindFor(category, region);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rng = makeRng(`${seed}|${kind}`);
  const glow = glowSpot(rng);
  const motifRng = makeRng(`${seed}|${kind}|motif`);
  return (
    <svg className={s.art} viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${uid}g`} cx={glow.cx} cy={glow.cy} r={glow.r} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BLUE} stopOpacity="0.55" />
          <stop offset="1" stopColor={BLUE} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}a`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={LIME} stopOpacity="0.2" />
          <stop offset="1" stopColor={LIME} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={ART_W} height={ART_H} className={s.artBg} />
      <rect width={ART_W} height={ART_H} fill={`url(#${uid}g)`} />
      <g className={s.artGridLines}>
        {[36, 72, 108, 144].map((y) => (
          <line key={y} x1={0} x2={ART_W} y1={y} y2={y} />
        ))}
      </g>
      <Motif kind={kind} rng={motifRng} gradId={`${uid}a`} />
    </svg>
  );
}
