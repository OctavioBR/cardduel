import type { TurnTimerInfo } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { useEffect, useMemo, useState } from "react";
import { clock } from "../room/clock";
import strings from "../room/strings/en.json";

/** The remaining time is highlighted from this many seconds left. */
export const TURN_TIMER_WARNING_SECONDS = 10;

/** Whole seconds left before `deadline`, from the server's clock. */
export function secondsLeft(
  deadline: number,
  serverNow: number,
  receivedAt: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((deadline - serverNow - (now - receivedAt)) / 1000));
}

/**
 * Both players' Turn Timer countdowns (#109). The Room acts on its own deadlines; this only
 * shows them. The countdown is a timer region, so it is not announced every second; the
 * player hears once when their own time is nearly up.
 */
export function TurnTimers({ timer }: { timer: TurnTimerInfo | null | undefined }) {
  // Deadlines are server times: count from when this copy arrived.
  const receivedAt = useMemo(() => (timer ? Date.now() : 0), [timer]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer || (timer.you === null && timer.opponent === null)) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  const left = (deadline: number | null) =>
    deadline === null ? null : secondsLeft(deadline, timer.serverNow, receivedAt, now);
  const you = left(timer.you);
  const opponent = left(timer.opponent);
  return (
    <div className="turn-timers">
      {you !== null ? (
        <Countdown text={strings.turnTimerYou} seconds={you} testId="turn-timer-you" />
      ) : null}
      {opponent !== null ? (
        <Countdown
          text={strings.turnTimerOpponent}
          seconds={opponent}
          testId="turn-timer-opponent"
        />
      ) : null}
      <span className="visually-hidden" role="status">
        {you !== null && you <= TURN_TIMER_WARNING_SECONDS ? strings.turnTimerWarning : ""}
      </span>
    </div>
  );
}

function Countdown({ text, seconds, testId }: { text: string; seconds: number; testId: string }) {
  const urgent = seconds <= TURN_TIMER_WARNING_SECONDS;
  return (
    <div className={`turn-timer${urgent ? " urgent" : ""}`} role="timer" data-testid={testId}>
      {formatCopy(text, { time: clock(seconds) })}
    </div>
  );
}
