import type { RowId, SpecialEffect, UnitAbility } from "@card-duel/engine";
import copy from "../strings/en.json";

const ROW_PATHS: Record<RowId, string> = {
  close: "M3 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0z",
  ranged: "M8 2.4 14 13.2H2z",
  siege: "M3 3h10v10H3z",
};

export const ROW_LABEL: Record<RowId, string> = {
  close: copy.close,
  ranged: copy.ranged,
  siege: copy.siege,
};

export function RowIcon({ row, size = 16 }: { row: RowId; size?: number }) {
  return (
    <svg
      className="cd-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={ROW_LABEL[row]}
    >
      <path d={ROW_PATHS[row]} fill="currentColor" />
    </svg>
  );
}

type IconName = UnitAbility | SpecialEffect["type"] | "hero";

const SCORCH_GLYPH = "M8 2c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z";
const UNIT_SCORCH_GLYPH =
  "M8 3c1 3 4 4 4 7.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-6.5zM2 3.5l1.5 1.5M14 3.5 12.5 5M1.5 9H3M14.5 9H13";

/** Simple stroke glyphs, original to Card Duel. */
const GLYPHS: Record<IconName, string> = {
  agile: "M2 6h10l-3-3M14 10H4l3 3",
  horn: "M3 6v4h2l6 3V3L5 6z",
  medic: "M6.5 2.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z",
  moraleBoost: "M8 13V4M4 8l4-4 4 4",
  muster: "M4 5.5a1.5 1.5 0 1 0 .01 0M12 5.5a1.5 1.5 0 1 0 .01 0M8 11a1.5 1.5 0 1 0 .01 0",
  tightBond: "M6 5H4a3 3 0 0 0 0 6h2M10 5h2a3 3 0 0 1 0 6h-2M5 8h6",
  scorch: SCORCH_GLYPH,
  spy: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 0 .01 0",
  weather: "M4.5 11.5h7a3 3 0 0 0 0-6 4 4 0 0 0-7.6 1A2.5 2.5 0 0 0 4.5 11.5z",
  clearWeather: "M8 4.5a3.5 3.5 0 1 0 .01 0M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15",
  decoy: "M3 3h10v6c0 3-2.5 4.5-5 4.5S3 12 3 9zM6 7h.01M10 7h.01",
  sideScorch: UNIT_SCORCH_GLYPH,
  battlefieldScorch: SCORCH_GLYPH,
  summon: "M4.5 13V3M1.5 6l3-3 3 3M11.5 3v10M8.5 10l3 3 3-3",
  berserker: "M5 2.5 3 13.5M9 2.5l-2 11M13 2.5l-2 11",
  frenzy:
    "M1.5 8.6C1.5 4.6 4.4 1.8 8 1.8s6.5 2.8 6.5 6.8zM6.1 9.6h3.8l.6 3.4a1 1 0 0 1-1 1.2H6.5a1 1 0 0 1-1-1.2z",
  hero: "M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z",
};

const LABEL: Record<IconName, string> = {
  agile: copy.agile,
  horn: copy.horn,
  medic: copy.medic,
  moraleBoost: copy.moraleBoost,
  muster: copy.muster,
  tightBond: copy.tightBond,
  scorch: copy.scorch,
  spy: copy.spy,
  weather: copy.weather,
  clearWeather: copy.clearWeather,
  decoy: copy.decoy,
  sideScorch: copy.scorch,
  battlefieldScorch: copy.battlefieldScorch,
  summon: copy.summon,
  berserker: copy.berserker,
  frenzy: copy.frenzy,
  hero: copy.hero,
};

export function AbilityIcon({
  name,
  size = 14,
  unit = false,
}: {
  name: IconName;
  size?: number;
  unit?: boolean;
}) {
  const filled = name === "hero" || name === "medic" || name === "frenzy";
  return (
    <svg
      className="cd-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={LABEL[name]}
    >
      <path
        d={unit && name === "scorch" ? UNIT_SCORCH_GLYPH : GLYPHS[name]}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function abilityLabel(name: IconName): string {
  return LABEL[name];
}
