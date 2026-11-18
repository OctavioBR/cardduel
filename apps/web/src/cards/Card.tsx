import type { CardDefinition, RowId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "../strings/en.json";
import { PlaceholderArt } from "./Art";
import { useCardDetailTrigger } from "./CardDetail";
import { AbilityIcon, abilityLabel, ROW_LABEL, RowIcon } from "./icons";
import { cardDef, cardName, cardText } from "./strings";

export type CardSize = "token" | "hand" | "tile" | "detail";

export interface CardProps {
  cardId: string;
  size: CardSize;
  /** Current Strength on the battlefield; coloured against printed Strength when given. */
  strength?: number | undefined;
  /** Copies badge ("×N") for the Deck builder. */
  count?: number | undefined;
  /** The card shown inside Card Detail itself does not open Card Detail. */
  noDetail?: boolean;
  /** Include read-only pile cards in keyboard navigation for the I shortcut. */
  keyboardDetail?: boolean;
}

/** Rows a card's icons show: both for Agile, and the Rows a Weather card affects. */
function rowsOf(def: CardDefinition): RowId[] {
  if (def.kind === "special") return def.effect.type === "weather" ? def.effect.rows : [];
  if (def.kind !== "unit") return [];
  return def.abilities.includes("agile") ? ["close", "ranged"] : [def.row];
}

function strengthClass(def: CardDefinition, strength: number | undefined): string {
  if (def.kind !== "unit" || strength === undefined || strength === def.strength) return "";
  return strength > def.strength ? " cd-raised" : " cd-lowered";
}

/**
 * Renders any card from catalog data and strings (ADR-0004). The board token shows only
 * Strength and icons; the other sizes add name, short ability text and art.
 */
export function Card({ cardId, size, strength, count, noDetail, keyboardDetail }: CardProps) {
  const trigger = useCardDetailTrigger(cardId, strength);
  const detail = noDetail ? {} : trigger;
  const def = cardDef(cardId);
  const name = cardName(cardId);
  if (!def) {
    return (
      <div className={`cd-card cd-${size} cd-f-neutral`} role="img" aria-label={name}>
        <span className="cd-name">{name}</span>
      </div>
    );
  }
  const shown = def.kind === "unit" ? (strength ?? def.strength) : null;
  const hero = def.kind === "unit" && def.hero;
  const abilities = def.kind === "unit" ? def.abilities.filter((a) => a !== "agile") : [];
  const effect = def.kind === "special" ? def.effect.type : null;
  const label = [
    name,
    shown !== null ? formatCopy(copy.strength, { p0: shown }) : null,
    rowsOf(def)
      .map((r) => ROW_LABEL[r])
      // Agile fits either Row; Weather affects every Row it names.
      .join(effect === "weather" ? copy.and : copy.or) || null,
    hero ? copy.hero : null,
    ...abilities.map(abilityLabel),
  ]
    .filter(Boolean)
    .join(", ");

  // Ability icons: over the art's top corner, under Strength; at the token's foot (no art).
  const iconSize = size === "detail" ? 24 : 14;
  const icons =
    hero || abilities.length > 0 ? (
      <div className="cd-icons">
        {hero ? <AbilityIcon name="hero" size={iconSize} /> : null}
        {abilities.map((a) => (
          <AbilityIcon key={a} name={a} size={iconSize} />
        ))}
      </div>
    ) : null;

  return (
    <div
      className={`cd-card cd-${size} cd-f-${def.faction} cd-k-${def.kind}${hero ? " cd-hero" : ""}`}
      role="img"
      aria-label={label}
      tabIndex={keyboardDetail ? 0 : undefined}
      aria-keyshortcuts={keyboardDetail ? "I" : undefined}
      data-card-id={cardId}
      {...detail}
    >
      <div className="cd-top">
        {shown !== null ? (
          <span className={`cd-strength${strengthClass(def, strength)}`}>{shown}</span>
        ) : effect ? (
          <span className="cd-strength cd-special-mark">
            <AbilityIcon name={effect} size={size === "detail" ? 22 : 14} />
          </span>
        ) : null}
        <span className="cd-rows">
          {rowsOf(def).map((r) => (
            <RowIcon key={r} row={r} size={size === "detail" ? 20 : size === "token" ? 11 : 14} />
          ))}
        </span>
      </div>
      {size === "token" ? (
        icons
      ) : (
        <div className="cd-art-box">
          <PlaceholderArt cardId={cardId} image={def.image} />
          {icons}
        </div>
      )}
      {size !== "token" ? <div className="cd-name">{name}</div> : null}
      {size === "hand" || size === "tile" || size === "detail" ? (
        <div className="cd-text">{cardText(cardId)}</div>
      ) : null}
      {count !== undefined ? (
        <span className="cd-count">
          {copy.label}
          {count}
        </span>
      ) : null}
    </div>
  );
}
