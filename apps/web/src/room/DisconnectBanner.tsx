import type { DisconnectInfo } from "@card-duel/engine";
import { useEffect, useState } from "react";
import strings from "./strings/en.json";

export function DisconnectBanner({
  disconnect,
  onClaim,
}: {
  disconnect: DisconnectInfo | null;
  onClaim: () => void;
}) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const receivedAt = Date.now();
    const update = () =>
      setRemaining(
        disconnect?.claimAt === null || !disconnect
          ? 0
          : Math.max(
              0,
              Math.ceil(
                (disconnect.claimAt - disconnect.serverNow - (Date.now() - receivedAt)) / 1000,
              ),
            ),
      );
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [disconnect]);
  if (!disconnect || disconnect.claimAt === null) return null;
  return (
    <div className="disconnect-banner" role="status">
      <span>
        {strings.opponentDisconnected}{" "}
        {remaining > 0 ? strings.graceCountdown.replace("{seconds}", String(remaining)) : null}
      </span>
      {remaining === 0 ? (
        <button type="button" onClick={onClaim}>
          {strings.claimWin}
        </button>
      ) : null}
    </div>
  );
}
