import type { CardDefinition } from "@card-duel/engine";
import { cardName } from "./catalog";
import type { Catalog, DeckInput, DeckProblem } from "./types";

/**
 * Valid Deck problems (GLOSSARY.md: Valid Deck): exactly one Leader of the Deck's Faction,
 * at least the minimum Unit Cards, at most the maximum Special Cards, no card beyond its copy
 * limit, and only cards of the Deck's Faction or Neutral Cards. Empty means valid.
 */
export function checkValidDeck(deck: DeckInput, catalog: Catalog): DeckProblem[] {
  const problems: DeckProblem[] = [];
  const name = (id: string) => cardName(catalog, id);
  const { minUnits, maxSpecials } = catalog.limits.valid;

  if (deck.leader === null) {
    problems.push({ code: "no_leader", message: "Choose a Leader." });
  } else {
    const leader = catalog.byId.get(deck.leader);
    if (leader?.kind !== "leader" || leader.faction !== deck.faction) {
      problems.push({
        code: "bad_leader",
        message: `${name(deck.leader)} is not a Leader of this Faction.`,
        cardId: deck.leader,
      });
    }
  }

  const counts = new Map<string, number>();
  let units = 0;
  let specials = 0;
  for (const id of deck.cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const def = catalog.byId.get(id);
    if (def?.kind === "unit") units++;
    if (def?.kind === "special") specials++;
  }

  for (const [id, count] of counts) {
    const def = catalog.byId.get(id);
    if (!def || def.kind === "leader") {
      problems.push({
        code: "unknown_card",
        message: `${name(id)} is not a card you can put in a Deck.`,
        cardId: id,
      });
      continue;
    }
    if (def.faction !== "neutral" && def.faction !== deck.faction) {
      problems.push({
        code: "wrong_faction",
        message: `${name(id)} belongs to another Faction.`,
        cardId: id,
      });
    }
    if (count > def.maxCopies) {
      problems.push({
        code: "too_many_copies",
        message: `Too many copies of ${name(id)}: ${count} (at most ${def.maxCopies}).`,
        cardId: id,
      });
    }
  }

  if (units < minUnits) {
    problems.push({
      code: "too_few_units",
      message: `A Deck needs at least ${minUnits} Unit Cards (has ${units}).`,
    });
  }
  if (specials > maxSpecials) {
    problems.push({
      code: "too_many_specials",
      message: `A Deck may hold at most ${maxSpecials} Special Cards (has ${specials}).`,
    });
  }
  return problems;
}

/**
 * Competitive Deck problems (GLOSSARY.md: Competitive Deck), on top of the Valid Deck
 * limits. The Deck builder shows these as warnings; a Competitive Room enforces them.
 */
export function checkCompetitiveDeck(deck: DeckInput, catalog: Catalog): DeckProblem[] {
  const limits = catalog.limits.competitive;
  const defs = deck.cards.map((id) => catalog.byId.get(id)).filter((d): d is CardDefinition => !!d);
  const units = defs.filter((d) => d.kind === "unit");
  const specials = defs.filter((d) => d.kind === "special").length;
  const medics = units.filter((d) => d.abilities.includes("medic")).length;
  const spies = units.filter((d) => d.abilities.includes("spy")).length;
  const strength = units.reduce((sum, d) => sum + d.strength, 0);

  const problems: DeckProblem[] = [];
  if (specials > limits.maxSpecials) {
    problems.push({
      code: "competitive_specials",
      message: `Competitive Decks hold at most ${limits.maxSpecials} Special Cards (has ${specials}).`,
    });
  }
  if (medics > limits.maxMedics) {
    problems.push({
      code: "competitive_medics",
      message: `Competitive Decks hold at most ${limits.maxMedics} Medics (has ${medics}).`,
    });
  }
  if (spies > limits.maxSpies) {
    problems.push({
      code: "competitive_spies",
      message: `Competitive Decks hold at most ${limits.maxSpies} Spies (has ${spies}).`,
    });
  }
  if (strength > limits.maxUnitStrength) {
    problems.push({
      code: "competitive_strength",
      message: `Competitive Decks have at most ${limits.maxUnitStrength} total Unit Strength (has ${strength}).`,
    });
  }
  return problems;
}

/** A Competitive Deck is a Valid Deck that also meets the competitive limits. */
export function isCompetitiveDeck(deck: DeckInput, catalog: Catalog): boolean {
  return (
    checkValidDeck(deck, catalog).length === 0 && checkCompetitiveDeck(deck, catalog).length === 0
  );
}
