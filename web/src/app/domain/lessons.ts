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

export interface ReadPage {
  kind: 'read';
  title: string;
  /** plain text; blocks are separated by a blank line; a block whose lines all start with "- " is a list */
  body: string;
  demo?: { setup?: string; moves: string; caption?: string; caseId?: string };
}

export interface TryPage {
  kind: 'try';
  title: string;
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
  /** the goal only counts in this many moves or fewer (for random crosses: the optimal length plus this) */
  extraMoves?: number;
  /** a case from the algorithm list: start from the case, hint is its algorithm */
  caseId?: string;
  /** shown once the page is passed */
  after?: string;
}
export type Page = ReadPage | TryPage;

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
      kind: 'read',
      title: 'The centres never move',
      body: 'Every face has one centre piece, fixed to the core of the cube. The colours are always opposite each other: white opposite yellow, green opposite blue, red opposite orange.\n\nSo the centres tell you which colour belongs on which face. Everything else is moved around them.',
    },
    {
      kind: 'read',
      title: 'Edges and corners',
      body: '- Edges have two colours. There are 12.\n- Corners have three colours. There are 8.\n- A piece never changes kind: an edge always stays an edge.\n\nSolving the cube means getting every edge and corner back next to the centres it matches.',
    },
    {
      kind: 'read',
      title: 'Reading the notation',
      body: '- A letter is a clockwise quarter turn of that face, as if you were looking straight at it: R right, L left, U up, D down, F front, B back.\n- A tick means anticlockwise: R′ is the opposite of R.\n- A 2 means a half turn: R2.\n\nWatch R followed by U′.',
      demo: { moves: "R U'", caption: 'R, then U′' },
    },
    {
      kind: 'try',
      title: 'Your first turns',
      prompt: 'Do R, then U′. Pick the direction first, then the face.',
      goal: 'match',
      target: "R U'",
      after: 'That is how every algorithm will be typed from now on.',
    },
    {
      kind: 'try',
      title: 'Half turns',
      prompt: 'Do F2, then L′.',
      goal: 'match',
      target: "F2 L'",
    },
    {
      kind: 'try',
      title: 'A famous four',
      prompt: 'Do R U R′ U′, in that order.',
      goal: 'match',
      target: "R U R' U'",
      after:
        'This is the "sexy move". It turns up in almost every algorithm, and you will use it to build the first layer next.',
    },
  ],

  'b-cross': [
    {
      kind: 'read',
      title: 'What the cross is',
      body: 'The white cross is four white edges around the white centre. Each one must also match the side centre: the white–green edge goes between the white and green centres, and so on.\n\nOn the screen the white face is at the bottom of the unfolded cube. A cross is done when the bottom shows a white plus sign and the colour on each edge matches the centre above it.',
    },
    {
      kind: 'read',
      title: 'Step 1: make a daisy',
      body: 'Bring the four white edges to the top layer with the white sticker facing up, around the yellow centre. It looks like a flower.\n\n- An edge on the bottom layer jumps to the top with a half turn of its face (F2).\n- An edge in the middle layer goes up with one turn of the face next to it.\n- Use U to get another edge out of the way when two of them collide.',
      demo: {
        moves: 'F2',
        caption: 'A half turn lifts a white edge from the bottom to the top, white still facing up',
      },
    },
    {
      kind: 'try',
      title: 'Finish the daisy',
      prompt:
        'One white edge was knocked out of the top layer. Put it back so all four face up on top.',
      goal: 'daisy',
      setup: `${DAISY} R`,
      solution: "R'",
    },
    {
      kind: 'try',
      title: 'Finish the daisy, harder',
      prompt: 'Two white edges were knocked out. Bring both back to the top with white facing up.',
      goal: 'daisy',
      setup: `${DAISY} R F'`,
      solution: 'F R′'.replace('′', "'"),
    },
    {
      kind: 'read',
      title: 'Step 2: match and drop',
      body: 'Look at one petal of the daisy. Turn the top layer (U) until the colour on its side matches the centre below it, then turn that face a half turn. The white edge drops into the cross, and it is already in the right place.\n\nRepeat for all four petals.',
      demo: {
        setup: DAISY,
        moves: DAISY,
        caption:
          'Each petal matches the centre below it, so a half turn of that face drops it into the cross',
      },
    },
    {
      kind: 'try',
      title: 'Daisy to cross',
      prompt:
        'The daisy is turned. Turn the top until a petal matches, then drop it. Finish the cross.',
      goal: 'cross',
      setup: `${DAISY} U`,
      solution: `U' ${DAISY}`,
    },
    {
      kind: 'try',
      title: 'Daisy to cross, turned further',
      prompt: 'Same idea: line each petal up with its centre before you drop it.',
      goal: 'cross',
      setup: `${DAISY} U2`,
      solution: `U2 ${DAISY}`,
    },
    {
      kind: 'try',
      title: 'A real scramble',
      prompt:
        'Solve the cross. Build a daisy first if you like, or find a shorter way. The hint knows the shortest.',
      goal: 'cross',
      randomCross: 0,
      extraMoves: 99,
      after: 'That is the whole skill. Speed and planning come later, in Intermediate.',
    },
  ],

  'b-corners': [
    {
      kind: 'read',
      title: 'The first layer',
      body: 'You have the cross. Now fill in the four white corners so the whole white layer is done. Each corner has white and two other colours, and the two side colours must match the centres next to it.\n\nHold the cube with the white cross at the bottom. Look for a white corner in the top layer.',
    },
    {
      kind: 'read',
      title: 'Line it up, then repeat the trigger',
      body: 'Turn the top layer (U) until the white corner is directly above the slot where it belongs: the slot between its two side colours’ centres. Put that slot at the front-right.\n\nThen repeat R U R′ U′ until the corner drops in.\n\n- White facing right: repeat it once.\n- White facing up: repeat it three times.\n- White facing front: repeat it five times.\n\nDo not stop in the middle: the cross comes back by itself when you finish.',
      demo: {
        setup: undoT(1),
        moves: T,
        caption: 'White facing right: one trigger drops the corner into its slot',
      },
    },
    {
      kind: 'try',
      title: 'White facing right',
      prompt: 'The corner is above its slot with white facing right. Finish the first layer.',
      goal: 'layer1',
      setup: undoT(1),
      solution: T,
    },
    {
      kind: 'try',
      title: 'White facing up',
      prompt: 'White is facing up this time. Repeat the trigger until the corner is in.',
      goal: 'layer1',
      setup: undoT(3),
      solution: rep(T, 3),
    },
    {
      kind: 'try',
      title: 'White facing front',
      prompt: 'White is facing the front. This one needs the trigger the most times.',
      goal: 'layer1',
      setup: undoT(5),
      solution: rep(T, 5),
    },
    {
      kind: 'try',
      title: 'Not above its slot yet',
      prompt:
        'The corner is on the top layer, but over the wrong slot. Turn U first, then use the trigger.',
      goal: 'layer1',
      setup: `${undoT(1)} U`,
      solution: `U' ${T}`,
    },
    {
      kind: 'try',
      title: 'Stuck in the slot',
      prompt:
        'The corner is in its slot but twisted. Do the trigger once to lift it out, then place it as before.',
      goal: 'layer1',
      setup: undoT(2),
      solution: rep(T, 2),
      after:
        'A corner in the bottom layer is lifted out by one trigger, then handled like the others.',
    },
  ],

  // ------------------------------------------------------------------------------ intermediate
  'i-cross': [
    {
      kind: 'read',
      title: 'Plan before you start',
      body: 'In a real solve you get 15 seconds to look at the scramble. Use all of them to plan the whole cross, then execute it without stopping.\n\n- Find the four white edges and see which are close to their places.\n- Aim for 7 moves or fewer. Most crosses can be solved in 5 to 7.\n- Plan with your eyes first. If you start moving to “see what happens” you will pause later.\n- Try different white-edge orders: the best plan is often not the first one you see.',
    },
    {
      kind: 'try',
      title: 'Cross in a few moves',
      prompt:
        'Plan it, then solve the cross. The target is shown; the hint reveals the shortest answer.',
      goal: 'cross',
      randomCross: 0,
      extraMoves: 2,
    },
    {
      kind: 'try',
      title: 'Cross, again',
      prompt: 'A new scramble. Spend a moment planning before your first move.',
      goal: 'cross',
      randomCross: 0,
      extraMoves: 2,
    },
    {
      kind: 'try',
      title: 'Cross, once more',
      prompt: 'One more. Try to beat the target by a move.',
      goal: 'cross',
      randomCross: 0,
      extraMoves: 1,
      after: 'You can keep going with the Cross page, which shows the best cross from every side.',
    },
  ],

  'i-f2l-idea': [
    {
      kind: 'read',
      title: 'Pairs, not pieces',
      body: 'After the cross, each of the four slots has one corner and one edge that belong together. Instead of placing them one after the other, F2L joins them into a pair and drops the pair in with a single short sequence.\n\nThe three situations are:\n\n- Both pieces are in the top layer: join them, then insert.\n- One piece is in its slot and the other is on top: move the top one next to it, then lift and insert.\n- Both are in the bottom layer or in the wrong slot: lift them out first, then it is one of the cases above.',
    },
    {
      kind: 'read',
      title: 'See one done',
      body: 'This is the simplest: the corner and the edge are both on top, with the white side facing the side of the cube. Watch the pair insert.',
      demo: {
        caseId: 'f2l-basic-09',
        moves: '',
        caption: 'The pair is already joined, so three moves insert it',
      },
    },
    {
      kind: 'try',
      title: 'Insert a pair',
      prompt:
        'The pair is joined on the top layer. Put it into the front-right slot. The hint shows the standard way.',
      goal: 'f2l',
      caseId: 'f2l-basic-09',
    },
    {
      kind: 'try',
      title: 'One piece in the slot',
      prompt:
        'The edge is in the slot and the corner is on top. Find a way to bring them together.',
      goal: 'f2l',
      caseId: 'f2l-basic-27',
    },
    {
      kind: 'try',
      title: 'Both in the slot',
      prompt:
        'Both pieces are in the slot but in the wrong way round. Lift them out, then pair them.',
      goal: 'f2l',
      caseId: 'f2l-basic-39',
      after:
        'Every F2L case is one of these three. The next step teaches the standard way to do each one, a few at a time.',
    },
  ],
};
