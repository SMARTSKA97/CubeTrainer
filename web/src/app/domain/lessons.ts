import {
  Cube,
  daisyDone,
  f2lReport,
  f2lSolved,
  firstLayerSolved,
  invertAlg,
  randomScramble,
  sameState,
  topCrossDone,
  topFaceDone,
} from './cube';
import { solveCross } from './cross-solver';

/**
 * Guided lessons. A lesson is a short list of pages: some explain (optionally with an animated
 * demonstration), the rest are practice on a cube drawn on screen. The practice is checked by the app
 * itself, so a page is only passed when the cube really is in the asked-for state.
 *
 * The cube is always held with white on the bottom, as in the F2L pictures.
 */
export type GoalId =
  | 'cross'
  | 'daisy'
  | 'layer1'
  | 'f2l'
  | 'topcross'
  | 'topface'
  | 'solved'
  /** exactly the cube you get by doing `target` from the start position */
  | 'match';

export interface Demo {
  setup?: string;
  moves: string;
  caption?: string;
  /** play a case from the algorithm list instead */
  caseId?: string;
}

/** Something to do on the practice cube. The page can only be left once it is done (or skipped). */
export interface Practice {
  prompt: string;
  goal: GoalId;
  /** moves that build the starting position from a solved cube */
  setup?: string;
  /** for goal 'match' */
  target?: string;
  /** a way to reach the goal, shown by the hint; defaults to undoing the setup */
  solution?: string;
  /** a random cross to solve: `moves` random turns away (0 = a full 20-move scramble) */
  randomCross?: number;
  /** the goal only counts in this many moves or fewer (random crosses: the optimal length plus this) */
  extraMoves?: number;
  /** a case from the algorithm list: start from the case, hint is its algorithm */
  caseId?: string;
  /** shown once the practice is passed */
  after?: string;
}

/** One screen of a lesson: a little to read, maybe a demonstration, and one thing to do. */
export interface Page {
  title: string;
  /** plain text; blocks are separated by a blank line; a block whose lines all start with "- " is a list */
  body?: string;
  demo?: Demo;
  practice?: Practice;
}

export function goalMet(goal: GoalId, cube: Cube, target?: Cube): boolean {
  switch (goal) {
    case 'cross':
      return crossOk(cube);
    case 'daisy':
      return daisyDone(cube);
    case 'layer1':
      return firstLayerSolved(cube);
    case 'f2l':
      return f2lSolved(cube);
    case 'topcross':
      return topCrossDone(cube);
    case 'topface':
      return topFaceDone(cube);
    case 'solved':
      return cube.isSolved();
    case 'match':
      return !!target && sameState(cube, target);
  }
}

function crossOk(cube: Cube): boolean {
  return f2lReport(cube).crossSolved;
}

/**
 * A cross to practise: `k` random turns from the solved cube (so the answer is short), or a full
 * random scramble when k is 0. The turns are kept only if they really spoil the cross.
 */
export function crossSetup(
  k: number,
  rng: () => number = Math.random,
): {
  setup: string;
  best: number;
  solution: string;
} {
  for (let i = 0; i < 200; i++) {
    const setup = randomScramble(k || 20, rng);
    const sol = solveCross(setup, 'D');
    if (!sol) continue;
    const min = k === 0 ? 5 : Math.min(k, 2);
    if (sol.length >= min && sol.length <= (k === 0 ? 7 : k))
      return { setup, best: sol.length, solution: sol.moves.join(' ') };
  }
  const setup = randomScramble(k || 20, rng);
  const sol = solveCross(setup, 'D');
  return { setup, best: sol?.length ?? 0, solution: sol?.moves.join(' ') ?? invertAlg(setup) };
}

// ---------------------------------------------------------------------------------------------
// The trigger and where a corner can be, worked out with the simulator:
// undoing (R U R' U') k times puts the white corner above its slot facing right (1), up (3) or front (5),
// or leaves it twisted in the slot (2: white right, 4: white front).
const T = "R U R' U'";
const rep = (alg: string, n: number) => Array(n).fill(alg).join(' ');
const undoT = (n: number) => invertAlg(rep(T, n));

/** the daisy: all four white edges up, built from a solved cube */
const DAISY = 'F2 R2 B2 L2';

export const PAGES: Record<string, Page[]> = {
  // ------------------------------------------------------------------------------- beginner
  'b-basics': [
    {
      title: 'The cube in 30 seconds',
      body: '- Every face has a fixed centre. White is opposite yellow, green opposite blue, red opposite orange. The centres tell you where each colour belongs.\n- Edges have two colours (12 of them), corners have three (8). A piece never changes kind.\n- Solving means getting every edge and corner next to the centres it matches.',
    },
    {
      title: 'Notation',
      body: '- A letter is a clockwise quarter turn of that face: R right, L left, U up, D down, F front, B back.\n- A tick (R\u2032) is anticlockwise. A 2 (R2) is a half turn.\n\nWatch R, then U\u2032, and then do it.',
      demo: { moves: "R U'", caption: 'R, then U\u2032' },
      practice: { prompt: 'Do R, then U\u2032.', goal: 'match', target: "R U'" },
    },
    {
      title: 'A famous four',
      body: 'Four moves you will use all the time, called the "sexy move". Once your fingers know it, the first layer and almost every algorithm gets easy.',
      practice: {
        prompt: 'Do R U R\u2032 U\u2032, in that order.',
        goal: 'match',
        target: "R U R' U'",
      },
    },
  ],

  'b-cross': [
    {
      title: 'Step 1: make a daisy',
      body: 'The white cross is four white edges around the white centre, each also matching its side centre. White is at the bottom on screen.\n\nFirst bring the four white edges up to the top layer with white facing up, around the yellow centre. It looks like a flower.\n\n- A white edge on the bottom jumps up with a half turn of its face.\n- One in the middle layer goes up with a single turn of the face next to it.',
      demo: {
        moves: 'F2',
        caption: 'A half turn lifts a white edge to the top, white still facing up',
      },
      practice: {
        prompt: 'One white edge was knocked out of the top layer. Put it back, white facing up.',
        goal: 'daisy',
        setup: `${DAISY} R`,
        solution: "R'",
      },
    },
    {
      title: 'Daisy, two edges',
      practice: {
        prompt: 'Two white edges were knocked out. Bring both back to the top.',
        goal: 'daisy',
        setup: `${DAISY} R F'`,
        solution: "F R'",
      },
    },
    {
      title: 'Step 2: match and drop',
      body: 'Turn the top layer until the side colour of a petal matches the centre below it, then give that face a half turn. The edge drops into the cross in the right place. Repeat for each petal.',
      demo: {
        setup: DAISY,
        moves: DAISY,
        caption: 'Each petal matches the centre below it, so a half turn drops it in',
      },
      practice: {
        prompt: 'The daisy is turned. Match a petal, drop it, and finish the cross.',
        goal: 'cross',
        setup: `${DAISY} U`,
        solution: `U' ${DAISY}`,
      },
    },
    {
      title: 'A real scramble',
      body: 'Now the whole thing. Build a daisy, or find a shorter way: the hint knows the shortest.',
      practice: {
        prompt: 'Solve the cross.',
        goal: 'cross',
        randomCross: 0,
        extraMoves: 99,
        after: 'That is the whole skill. Speed and planning come later, in Intermediate.',
      },
    },
  ],

  'b-corners': [
    {
      title: 'The trigger',
      body: 'With the cross at the bottom, find a white corner in the top layer. Turn U until it is directly above its slot (between the centres matching its side colours), with that slot at the front-right. Then repeat R U R\u2032 U\u2032 until it drops in.\n\n- White facing right: repeat once.\n- White facing up: three times.\n- White facing front: five times.',
      demo: {
        setup: undoT(1),
        moves: T,
        caption: 'White facing right: one trigger drops the corner in',
      },
      practice: {
        prompt: 'White is facing right. Finish the first layer.',
        goal: 'layer1',
        setup: undoT(1),
        solution: T,
      },
    },
    {
      title: 'White facing up',
      practice: {
        prompt: 'Repeat the trigger until the corner is in.',
        goal: 'layer1',
        setup: undoT(3),
        solution: rep(T, 3),
      },
    },
    {
      title: 'White facing front',
      practice: {
        prompt: 'This one needs the trigger the most times.',
        goal: 'layer1',
        setup: undoT(5),
        solution: rep(T, 5),
      },
    },
    {
      title: 'Wrong slot, or stuck',
      body: 'If the corner is over the wrong slot, turn U first. If it is stuck in the bottom layer, do the trigger once to lift it out, then place it as before.',
      practice: {
        prompt: 'The corner is over the wrong slot. Turn U, then use the trigger.',
        goal: 'layer1',
        setup: `${undoT(1)} U`,
        solution: `U' ${T}`,
        after:
          'A corner stuck in the bottom layer is lifted out by one trigger, then handled like these.',
      },
    },
  ],

  // ------------------------------------------------------------------------------ intermediate
  'i-cross': [
    {
      title: 'Plan, then move',
      body: 'In a real solve you get 15 seconds of inspection. Use all of them to plan the whole cross, then execute without stopping.\n\n- Aim for 7 moves or fewer. Most crosses take 5 to 7.\n- Try more than one order for the white edges.\n- Do not move to "see what happens": you will pause later.',
      practice: {
        prompt:
          'Plan it, then solve the cross. The target is shown; the hint reveals the shortest answer.',
        goal: 'cross',
        randomCross: 0,
        extraMoves: 2,
      },
    },
    {
      title: 'Cross, again',
      practice: {
        prompt: 'A new scramble. Spend a moment planning before your first move.',
        goal: 'cross',
        randomCross: 0,
        extraMoves: 2,
      },
    },
    {
      title: 'Beat the target',
      practice: {
        prompt: 'One more. Try to be one move better.',
        goal: 'cross',
        randomCross: 0,
        extraMoves: 1,
        after: 'The Cross page shows the best cross from every side, to keep practising.',
      },
    },
  ],

  'i-f2l-idea': [
    {
      title: 'Pairs, not pieces',
      body: 'After the cross, each slot has one corner and one edge that belong together. F2L joins them into a pair and drops it in with one short sequence.\n\n- Both pieces on top: join them, then insert.\n- One piece in its slot, the other on top: bring the top one next to it, then lift and insert.\n- Both in the bottom layer: lift them out first, then it is one of the above.',
      demo: { caseId: 'f2l-basic-09', moves: '', caption: 'A joined pair: three moves insert it' },
      practice: {
        prompt: 'The pair is joined on top. Insert it into the front-right slot.',
        goal: 'f2l',
        caseId: 'f2l-basic-09',
      },
    },
    {
      title: 'One piece in the slot',
      practice: {
        prompt: 'The edge is in the slot, the corner on top. Bring them together.',
        goal: 'f2l',
        caseId: 'f2l-basic-27',
      },
    },
    {
      title: 'Both in the slot',
      practice: {
        prompt: 'Both pieces are in the slot, the wrong way round. Lift them out, then pair them.',
        goal: 'f2l',
        caseId: 'f2l-basic-39',
        after:
          'Every F2L case is one of these three. The next step teaches the standard way to do each.',
      },
    },
  ],
};
