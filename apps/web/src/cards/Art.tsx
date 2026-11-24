/** Small deterministic hash of a card id, for its placeholder art. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** The v2 illustrations ship in two sizes for tiles and Card Detail. */
export function CardImage({ image, className }: { image: string; className: string }) {
  const src = `/cards/${image}`;
  const srcSet = image.startsWith("v2/") ? `/cards/thumb/${image} 224w, ${src} 512w` : undefined;
  return (
    <img
      className={className}
      src={src}
      srcSet={srcSet}
      sizes="auto, 256px"
      alt=""
      draggable={false}
      loading="lazy"
    />
  );
}

/** Older catalog cards and development fixtures fall back to deterministic Faction shapes. */
export function CardArt({ cardId, image }: { cardId: string; image?: string | undefined }) {
  if (image) return <CardImage image={image} className="cd-art-img" />;
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
