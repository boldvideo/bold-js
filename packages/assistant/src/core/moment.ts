export type StuckMoment =
  | { kind: "paused"; at: number }
  | { kind: "relistened"; from: number; to: number };

export const PAUSE_AFTER_MS = 2000;
const SKIP_SECONDS = 3;
const RELISTEN_MAX_SECONDS = 60;
const EARLIEST_MOMENT_SECONDS = 15;

/** All positions are seconds. A small forward move is playback, not a seek. */
export function momentAfterMove(current: StuckMoment | null, previous: number, seconds: number) {
  const change = seconds - previous;
  if (change > 0 && change < SKIP_SECONDS) {
    const keep = current?.kind === "relistened" && seconds <= current.to;
    return { moment: keep ? current : null, played: true };
  }
  if (change <= -SKIP_SECONDS && -change <= RELISTEN_MAX_SECONDS) {
    return { moment: { kind: "relistened" as const, from: seconds, to: previous }, played: false };
  }
  if (Math.abs(change) >= SKIP_SECONDS) return { moment: null, played: false };
  return { moment: current, played: false };
}

/** Call after PAUSE_AFTER_MS without movement; arriving at a saved position is not a pause. */
export function momentAfterStandingStill(current: StuckMoment | null, seconds: number, hasPlayed: boolean): StuckMoment | null {
  if (!hasPlayed || seconds < EARLIEST_MOMENT_SECONDS) return current;
  return current?.kind === "relistened" ? current : { kind: "paused", at: seconds };
}
