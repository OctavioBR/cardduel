/** Small deterministic hash of a card id, for its placeholder art. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Abstract placeholder art: a few faction-tinted shapes placed from the card id's hash, so
 * every card looks different but needs no image. Vector, so it is sharp at any pixel ratio.
 */
export function PlaceholderArt({ cardId, image }: { cardId: string; image?: string | undefined }) {
  if (image) return <img className="cd-art-img" src={`/cards/${image}`} alt="" />;
  const h = hashId(cardId);
  const shapes = [0, 1, 2].map((i) => {
    const v = (h >>> (i * 9)) & 511;
    return {
      x: 10 + (v % 80),
      y: 10 + ((v >> 3) % 60),
      r: 10 + ((v >> 5) % 22),
      o: 0.25 + i * 0.2,
    };
  });
  return (
    <svg
      className="cd-art"
      viewBox="0 0 100 80"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="100" height="80" className="cd-art-ground" />
      {shapes.map((s, i) =>
        i === 1 ? (
          <rect
            key={`r${s.x}-${s.y}`}
            x={s.x - s.r}
            y={s.y - s.r / 2}
            width={s.r * 2}
            height={s.r}
            className="cd-art-shape"
            opacity={s.o}
            transform={`rotate(${(h % 60) - 30} ${s.x} ${s.y})`}
          />
        ) : (
          <circle
            key={`c${s.x}-${s.y}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            className="cd-art-shape"
            opacity={s.o}
          />
        ),
      )}
    </svg>
  );
}
