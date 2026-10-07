/** Is a user-typed algorithm really another way to solve a given case? */
import { Cube, formatMoves, invertAlg, parseMoves, relativeKey } from './cube';

export interface AlgCheck {
  ok: boolean;
  /** cleaned-up text when ok, a short reason when not */
  alg?: string;
  error?: string;
}

/**
 * Builds the case from the known algorithm, then compares what `candidate` does with what the known
 * algorithm does. Same end position (judged by the centres, so whole-cube turns are fine) = valid.
 */
export function algSolvesCase(knownAlg: string, candidate: string): AlgCheck {
  const text = candidate.trim();
  if (!text) return { ok: false, error: 'Type the moves first.' };
  let moves;
  try {
    moves = parseMoves(text.replace(/[‘’′`]/g, "'"));
  } catch (e) {
    return { ok: false, error: (e as Error).message.replace('Cannot parse move', 'Not a move:') };
  }
  if (moves.length === 0) return { ok: false, error: 'Type the moves first.' };
  if (moves.length > 40) return { ok: false, error: 'That is too long for one algorithm.' };
  const start = new Cube().apply(invertAlg(knownAlg));
  const want = relativeKey(start.clone().apply(knownAlg));
  const got = relativeKey(start.clone().apply(moves));
  return got === want
    ? { ok: true, alg: formatMoves(moves) }
    : {
        ok: false,
        error:
          'That does not solve this case. Check the moves, or a missing U turn at the start or end.',
      };
}
