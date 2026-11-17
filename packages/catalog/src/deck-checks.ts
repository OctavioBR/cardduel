import type { CardDefinition } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { cardName } from "./catalog";
import copy from "./strings/en.json";
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
    problems.push({ code: "no_leader", message: copy.chooseALeader });
  } else {
    const leader = catalog.byId.get(deck.leader);
    if (leader?.kind !== "leader" || leader.faction !== deck.faction) {
      problems.push({
        code: "bad_leader",
        message: formatCopy(copy.isNotALeaderOfThis, { p0: name(deck.leader) }),
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
        message: formatCopy(copy.isNotACardYouCan, { p0: name(id) }),
        cardId: id,
      });
      continue;
    }
    if (def.faction !== "neutral" && def.faction !== deck.faction) {
      problems.push({
        code: "wrong_faction",
        message: formatCopy(copy.belongsToAnotherFaction, { p0: name(id) }),
        cardId: id,
      });
    }
    if (count > def.maxCopies) {
      problems.push({
        code: "too_many_copies",
        message: formatCopy(copy.tooManyCopiesOfAtMost, {
          p0: name(id),
          p1: count,
          p2: def.maxCopies,
        }),
        cardId: id,
      });
    }
  }

  if (units < minUnits) {
    problems.push({
      code: "too_few_units",
      message: formatCopy(copy.aDeckNeedsAtLeastUnit, { p0: minUnits, p1: units }),
    });
  }
  if (specials > maxSpecials) {
    problems.push({
      code: "too_many_specials",
      message: formatCopy(copy.aDeckMayHoldAtMost, { p0: maxSpecials, p1: specials }),
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
      message: formatCopy(copy.competitiveDecksHoldAtMostSpecial, {
        p0: limits.maxSpecials,
        p1: specials,
      }),
    });
  }
  if (medics > limits.maxMedics) {
    problems.push({
      code: "competitive_medics",
      message: formatCopy(copy.competitiveDecksHoldAtMostMedics, {
        p0: limits.maxMedics,
        p1: medics,
      }),
    });
  }
  if (spies > limits.maxSpies) {
    problems.push({
      code: "competitive_spies",
      message: formatCopy(copy.competitiveDecksHoldAtMostSpies, { p0: limits.maxSpies, p1: spies }),
    });
  }
  if (strength > limits.maxUnitStrength) {
    problems.push({
      code: "competitive_strength",
      message: formatCopy(copy.competitiveDecksHaveAtMostTotal, {
        p0: limits.maxUnitStrength,
        p1: strength,
      }),
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
