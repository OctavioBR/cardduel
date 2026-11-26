import { type CardDefinition, ROWS, type UnitAbility } from "@card-duel/engine";
import { loadCatalog } from "./catalog";
import { checkValidDeck } from "./deck-checks";
import type { CatalogData } from "./types";

/** Unit abilities a catalog version may use. */
export const UNIT_ABILITIES: readonly UnitAbility[] = [
  "agile",
  "horn",
  "medic",
  "moraleBoost",
  "muster",
  "tightBond",
  "scorch",
  "spy",
  "battlefieldScorch",
  "summon",
  "berserker",
  "frenzy",
];
export const SPECIAL_EFFECTS = [
  "weather",
  "clearWeather",
  "horn",
  "decoy",
  "scorch",
  "frenzy",
] as const;
export const LEADER_KINDS = [
  "playWeatherFromDeck",
  "playCardFromDeck",
  "clearWeather",
  "hornRow",
  "scorchRow",
  "returnFromDiscard",
  "drawChosenFromDeck",
  "discardToDrawChosen",
  "takeFromOpponentDiscard",
  "lookAtOpponentHand",
  "playBondCopyFromDeck",
  "shuffleDiscardsIntoDecks",
  "moveAgileUnits",
  "drawFromDeck",
  "passive",
] as const;
/** Passive Leader kinds: Steady Ground was approved in the card set review (#29). */
export const PASSIVE_LEADER_KINDS = [
  "steadyGround",
  "stormHardened",
  "doubledSpies",
  "randomMedic",
  "cancelOpponentLeader",
] as const;
/** Special Cards a playCardFromDeck Leader may name: those needing no Row or target. */
const LEADER_PLAYABLE_EFFECTS = ["weather", "clearWeather", "scorch", "frenzy"];
const FACTIONS = ["swarm", "court", "kingdom", "vikings", "elves"] as const;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks a catalog version against the engine's card type and the card rules. Returns
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

  const byId = new Map(data.cards.map((card) => [card.id, card]));
  const groups = new Map<string, CardDefinition[]>();
  const called = new Set<string>();
  for (const card of data.cards) {
    if (card.kind !== "unit") continue;
    if (card.musterGroup) {
      groups.set(card.musterGroup, [...(groups.get(card.musterGroup) ?? []), card]);
    }
    if (card.musterCalls) called.add(card.musterCalls);
  }
  for (const [group, members] of groups) {
    for (const m of members) {
      if (m.kind === "unit" && m.abilities.includes("agile")) {
        errors.push(
          `Muster group "${group}": Agile card "${m.id}" is not allowed in a Muster group.`,
        );
      }
      if (m.kind === "unit" && !m.abilities.includes("muster") && !called.has(group)) {
        errors.push(`Card "${m.id}": musterGroup "${group}" is only for Muster cards.`);
      }
    }
  }
  for (const group of called) {
    if (!groups.has(group)) errors.push(`Muster group "${group}" is called but has no cards.`);
  }

  // Side Deck cards: each Summon or Berserker names one, and each one is named.
  const named = new Set<string>();
  for (const card of data.cards) {
    if (card.kind !== "unit") continue;
    for (const [field, ability] of [
      ["summons", "summon"],
      ["transformsInto", "berserker"],
    ] as const) {
      const target = card[field];
      if (!target) continue;
      named.add(target);
      const def = byId.get(target);
      if (def?.kind !== "unit" || !def.sideDeck) {
        errors.push(`Card "${card.id}": ${field} must name a Side Deck Unit.`);
      } else if (def.faction !== card.faction) {
        errors.push(`Card "${card.id}": its Side Deck card belongs to another Faction.`);
      }
      if (!card.abilities.includes(ability)) {
        errors.push(`Card "${card.id}": ${field} is only for ${ability} cards.`);
      }
    }
  }
  for (const card of data.cards) {
    if (card.kind === "unit" && card.sideDeck && !named.has(card.id)) {
      errors.push(`Card "${card.id}": no Summon or Berserker card brings this Side Deck card.`);
    }
    if (card.kind === "leader" && card.ability?.type === "playCardFromDeck") {
      const def = byId.get(card.ability.card);
      if (
        def?.kind !== "special" ||
        !LEADER_PLAYABLE_EFFECTS.includes(def.effect.type) ||
        (def.faction !== "neutral" && def.faction !== card.faction)
      ) {
        errors.push(
          `Card "${card.id}": playCardFromDeck must name a Weather, Clear Weather, Scorch or Frenzy card it can hold.`,
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
    const factions = FACTIONS.filter((f) => data.cards.some((card) => card.faction === f));
    for (const faction of factions) {
      const deck = data.starterDecks[faction];
      if (!deck) {
        errors.push(`Starter Deck for ${faction} is missing.`);
        continue;
      }
      if (deck.faction !== faction)
        errors.push(`Starter Deck for ${faction} has Faction ${deck.faction}.`);
      for (const p of checkValidDeck(deck, catalog)) {
        errors.push(`Starter Deck for ${faction} is not a Valid Deck: ${p.message}`);
      }
    }
  }
  return errors;
}

function validateCard(card: CardDefinition): string[] {
  const errors: string[] = [];
  const faction = card.faction as string;
  if (![...FACTIONS, "neutral"].includes(faction)) errors.push(`unknown Faction "${faction}".`);
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
        if (!UNIT_ABILITIES.includes(a)) errors.push(`ability "${a}" is not a known ability.`);
      }
      if (new Set(card.abilities).size !== card.abilities.length) errors.push("abilities repeat.");
      const muster = card.abilities.includes("muster");
      if (muster && !card.musterGroup && !card.musterCalls)
        errors.push("a Muster card needs a musterGroup or musterCalls.");
      if (!muster && card.musterCalls) errors.push("musterCalls is only for Muster cards.");
      if (card.abilities.includes("summon") && !card.summons)
        errors.push("a Summon card needs summons.");
      if (card.abilities.includes("berserker") && !card.transformsInto)
        errors.push("a Berserker needs transformsInto.");
      if (card.sideDeck !== undefined && card.sideDeck !== true)
        errors.push("sideDeck must be true when set.");
      if (card.abilities.includes("agile") && card.row !== "close") {
        errors.push("an Agile Unit's printed Row must be Close (it may also use Ranged).");
      }
      break;
    }
    case "special": {
      const type = card.effect?.type as string;
      if (!(SPECIAL_EFFECTS as readonly string[]).includes(type))
        errors.push(`effect "${type}" is not a known effect.`);
      if (card.effect?.type === "weather") {
        if (!card.effect.rows?.length || card.effect.rows.some((r) => !ROWS.includes(r))) {
          errors.push("Weather needs one or more valid Rows.");
        }
      }
      break;
    }
    case "leader": {
      const type = card.ability?.type as string;
      if (!(LEADER_KINDS as readonly string[]).includes(type)) {
        errors.push(`Leader ability "${type}" is not an approved kind.`);
      }
      if (card.ability?.type === "passive") {
        const passive = card.ability.passive as string | undefined;
        if (!(PASSIVE_LEADER_KINDS as readonly string[]).includes(passive ?? "")) {
          errors.push(`Leader passive "${passive}" is not an approved kind.`);
        }
      }
      if (card.ability?.type === "scorchRow" && !ROWS.includes(card.ability.row)) {
        errors.push("a Scorch-Row Leader needs a valid Row.");
      }
      if (
        card.ability?.type === "hornRow" &&
        card.ability.row !== undefined &&
        !ROWS.includes(card.ability.row)
      ) {
        errors.push("a Horn-Row Leader's Row must be valid.");
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
