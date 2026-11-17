import { type CardDefinition, ROWS, type UnitAbility } from "@card-duel/engine";
import { loadCatalog } from "./catalog";
import { checkCompetitiveDeck, checkValidDeck } from "./deck-checks";
import type { CatalogData } from "./types";

/** Unit abilities in v1. Summon, Berserker and Mardroeme wait for their Faction. */
export const V1_UNIT_ABILITIES: readonly UnitAbility[] = [
  "agile",
  "horn",
  "medic",
  "moraleBoost",
  "muster",
  "tightBond",
  "scorch",
  "spy",
];
export const V1_SPECIAL_EFFECTS = ["weather", "clearWeather", "horn", "decoy", "scorch"] as const;
export const V1_LEADER_KINDS = [
  "playWeatherFromDeck",
  "clearWeather",
  "hornRow",
  "scorchRow",
  "returnFromDiscard",
  "drawChosenFromDeck",
  "lookAtOpponentHand",
  "passive",
] as const;
/** Passive Leader kinds approved in the card set review (#29). */
export const V1_PASSIVE_LEADER_KINDS = ["steadyGround"] as const;
const FACTIONS = ["swarm", "court"] as const;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks a catalog version against the engine's card type and the v1 rules. Returns
 * readable errors; empty means valid. Run in tests, never at runtime.
 */
export function validateCatalog(data: CatalogData): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, card] of data.cards.entries()) {
    const where = `Card ${typeof card?.id === "string" ? `"${card.id}"` : `#${i}`}`;
    if (typeof card?.id !== "string" || !ID.test(card.id)) {
      errors.push(`${where}: id must be lowercase words joined by hyphens.`);
      continue;
    }
    if (seen.has(card.id)) errors.push(`${where}: duplicate id.`);
    seen.add(card.id);
    errors.push(...validateCard(card).map((e) => `${where}: ${e}`));
  }

  const groups = new Map<string, CardDefinition[]>();
  for (const card of data.cards) {
    if (card.kind === "unit" && card.musterGroup) {
      groups.set(card.musterGroup, [...(groups.get(card.musterGroup) ?? []), card]);
    }
  }
  for (const [group, members] of groups) {
    for (const m of members) {
      if (m.kind === "unit" && m.abilities.includes("agile")) {
        errors.push(
          `Muster group "${group}": Agile card "${m.id}" is not allowed in a Muster group.`,
        );
      }
    }
  }

  const en = data.strings.en ?? {};
  if (!data.strings.en) errors.push("Strings: English (en) strings are required.");
  for (const card of data.cards) {
    for (const [lang, table] of Object.entries(data.strings)) {
      const s = table[card.id];
      if (!s || typeof s.name !== "string" || !s.name.trim()) {
        errors.push(`Card "${card.id}": missing ${lang} name.`);
      }
      if (s && typeof s.text !== "string")
        errors.push(`Card "${card.id}": ${lang} text must be a string.`);
    }
  }
  for (const id of Object.keys(en)) {
    if (!seen.has(id)) errors.push(`Strings: "${id}" has strings but no card.`);
  }

  const { valid, competitive } = data.limits ?? {};
  for (const [key, value] of Object.entries({ ...valid, ...competitive })) {
    if (!Number.isInteger(value) || (value as number) < 0)
      errors.push(`Limits: ${key} must be a whole number.`);
  }

  if (errors.length === 0) {
    const catalog = loadCatalog(data);
    for (const faction of FACTIONS) {
      const deck = data.starterDecks[faction];
      if (!deck) {
        errors.push(`Starter Deck for ${faction} is missing.`);
        continue;
      }
      if (deck.faction !== faction)
        errors.push(`Starter Deck for ${faction} has Faction ${deck.faction}.`);
      for (const p of [...checkValidDeck(deck, catalog), ...checkCompetitiveDeck(deck, catalog)]) {
        errors.push(`Starter Deck for ${faction} is not a Competitive Deck: ${p.message}`);
      }
    }
  }
  return errors;
}

function validateCard(card: CardDefinition): string[] {
  const errors: string[] = [];
  const faction = card.faction as string;
  if (!["swarm", "court", "neutral"].includes(faction))
    errors.push(`unknown Faction "${faction}".`);
  if (!Number.isInteger(card.maxCopies) || card.maxCopies < 1)
    errors.push("maxCopies must be at least 1.");
  switch (card.kind) {
    case "unit": {
      if (!Number.isInteger(card.strength) || card.strength < 0)
        errors.push("strength must be a whole number.");
      if (!ROWS.includes(card.row)) errors.push(`unknown Row "${card.row}".`);
      if (typeof card.hero !== "boolean") errors.push("hero must be true or false.");
      if (!Array.isArray(card.abilities)) {
        errors.push("abilities must be a list.");
        break;
      }
      for (const a of card.abilities) {
        if (!V1_UNIT_ABILITIES.includes(a)) errors.push(`ability "${a}" is not in v1.`);
      }
      if (new Set(card.abilities).size !== card.abilities.length) errors.push("abilities repeat.");
      const muster = card.abilities.includes("muster");
      if (muster && !card.musterGroup) errors.push("a Muster card needs a musterGroup.");
      if (!muster && card.musterGroup) errors.push("musterGroup is only for Muster cards.");
      if (card.abilities.includes("agile") && card.row !== "close") {
        errors.push("an Agile Unit's printed Row must be Close (it may also use Ranged).");
      }
      break;
    }
    case "special": {
      const type = card.effect?.type as string;
      if (!(V1_SPECIAL_EFFECTS as readonly string[]).includes(type))
        errors.push(`effect "${type}" is not in v1.`);
      if (card.effect?.type === "weather") {
        if (!card.effect.rows?.length || card.effect.rows.some((r) => !ROWS.includes(r))) {
          errors.push("Weather needs one or more valid Rows.");
        }
      }
      if (card.faction !== "neutral") errors.push("Special Cards are Neutral in v1.");
      break;
    }
    case "leader": {
      const type = card.ability?.type as string;
      if (!(V1_LEADER_KINDS as readonly string[]).includes(type)) {
        errors.push(`Leader ability "${type}" is not an approved v1 kind.`);
      }
      if (card.ability?.type === "passive") {
        const passive = card.ability.passive as string | undefined;
        if (!(V1_PASSIVE_LEADER_KINDS as readonly string[]).includes(passive ?? "")) {
          errors.push(`Leader passive "${passive}" is not an approved v1 kind.`);
        }
      }
      if (card.ability?.type === "scorchRow" && !ROWS.includes(card.ability.row)) {
        errors.push("a Scorch-Row Leader needs a valid Row.");
      }
      if (card.faction === "neutral") errors.push("a Leader belongs to a Faction.");
      if (card.maxCopies !== 1) errors.push("a Leader has maxCopies 1.");
      break;
    }
    default:
      errors.push(`unknown kind "${(card as { kind?: string }).kind}".`);
  }
  return errors;
}
