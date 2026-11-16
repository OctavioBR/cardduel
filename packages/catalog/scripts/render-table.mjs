#!/usr/bin/env node
// Renders a catalog version as Markdown tables, for reviewing the card set without reading
// JSON. Usage: pnpm --filter @card-duel/catalog table [version]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2] ?? "v1";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", version);
const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const cards = read("cards.json");
const starter = read("starter-decks.json");
const limits = read("limits.json");
const en = read("strings/en.json");
const byId = new Map(cards.map((c) => [c.id, c]));
const name = (id) => en[id]?.name ?? id;
const ROW = { close: "Close", ranged: "Ranged", siege: "Siege" };
const ABILITY = {
  agile: "Agile",
  horn: "Horn",
  medic: "Medic",
  moraleBoost: "Morale Boost",
  muster: "Muster",
  tightBond: "Tight Bond",
  scorch: "Scorch",
  spy: "Spy",
};
const cell = (s) => String(s).replaceAll("|", "\\|");

const out = [];
out.push(`# Card Catalog ${version}`, "");
for (const faction of ["swarm", "court", "neutral"]) {
  const title = faction[0].toUpperCase() + faction.slice(1);
  const units = cards.filter((c) => c.faction === faction && c.kind === "unit");
  const specials = cards.filter((c) => c.faction === faction && c.kind === "special");
  const leaders = cards.filter((c) => c.faction === faction && c.kind === "leader");
  const copies = [...units, ...specials].reduce((n, c) => n + c.maxCopies, 0);
  out.push(`## ${title} (${units.length + specials.length} cards, ${copies} copies)`, "");
  if (units.length) {
    out.push(
      "| Name | Str | Row | Hero | Abilities | Copies | Text |",
      "|---|---:|---|:-:|---|---:|---|",
    );
    const sorted = [...units].sort(
      (a, b) => b.strength - a.strength || name(a.id).localeCompare(name(b.id)),
    );
    for (const c of sorted) {
      const abilities = c.abilities
        .map((a) => (a === "muster" ? `Muster (${c.musterGroup})` : ABILITY[a]))
        .join(", ");
      out.push(
        `| ${cell(name(c.id))} | ${c.strength} | ${c.abilities.includes("agile") ? "Close/Ranged" : ROW[c.row]} | ${c.hero ? "★" : ""} | ${abilities} | ${c.maxCopies} | ${cell(en[c.id]?.text ?? "")} |`,
      );
    }
    out.push("");
  }
  if (specials.length) {
    out.push("| Special Card | Effect | Copies | Text |", "|---|---|---:|---|");
    for (const c of specials) {
      const effect =
        c.effect.type === "weather"
          ? `Weather (${c.effect.rows.map((r) => ROW[r]).join(" + ")})`
          : c.effect.type;
      out.push(
        `| ${cell(name(c.id))} | ${effect} | ${c.maxCopies} | ${cell(en[c.id]?.text ?? "")} |`,
      );
    }
    out.push("");
  }
  if (leaders.length) {
    out.push("| Leader | Ability kind | Text |", "|---|---|---|");
    for (const c of leaders) {
      const kind =
        c.ability.type === "scorchRow" ? `scorchRow (${ROW[c.ability.row]})` : c.ability.type;
      out.push(`| ${cell(name(c.id))} | ${kind} | ${cell(en[c.id]?.text ?? "")} |`);
    }
    out.push("");
  }
}

out.push("## Starter Decks", "");
for (const [faction, deck] of Object.entries(starter)) {
  const counts = new Map();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const units = deck.cards.map((id) => byId.get(id)).filter((c) => c.kind === "unit");
  const specials = deck.cards.filter((id) => byId.get(id).kind === "special").length;
  const strength = units.reduce((n, c) => n + c.strength, 0);
  const medics = units.filter((c) => c.abilities.includes("medic")).length;
  const spies = units.filter((c) => c.abilities.includes("spy")).length;
  out.push(
    `### ${faction[0].toUpperCase() + faction.slice(1)}: ${name(deck.leader)}`,
    "",
    `${units.length} Units, ${specials} Special Cards, total Unit Strength ${strength}/${limits.competitive.maxUnitStrength}, ${medics} Medics, ${spies} Spies.`,
    "",
    [...counts].map(([id, n]) => `${n}× ${name(id)}`).join(" · "),
    "",
  );
}

out.push(
  "## Limits",
  "",
  `Valid Deck: at least ${limits.valid.minUnits} Units, at most ${limits.valid.maxSpecials} Special Cards.`,
  `Competitive Deck: at most ${limits.competitive.maxSpecials} Special Cards, ${limits.competitive.maxMedics} Medics, ${limits.competitive.maxSpies} Spies, ${limits.competitive.maxUnitStrength} total Unit Strength.`,
);
console.log(out.join("\n"));
