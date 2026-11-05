import type { CaseMemory } from './memory';
import { isRecalled } from './memory';
import type { CaseStatus, Solve } from './stats';
import { effective } from './stats';

/**
 * The learning path. Three levels, each a short list of steps done in order:
 *  - Beginner: layer by layer (the way almost everyone starts), with a handful of algorithms.
 *  - Intermediate: CFOP with the 2-look last layer: intuitive cross, F2L cases, 2-look OLL and PLL.
 *  - Advanced: full PLL, full OLL and the F2L cases that are not obvious.
 * A step is a short lesson, a set of algorithms to memorise (a few at a time), or a goal for full solves.
 */
export type LevelId = 'beginner' | 'intermediate' | 'advanced';
export const LEVEL_IDS: LevelId[] = ['beginner', 'intermediate', 'advanced'];

export interface LessonSection {
  title: string;
  /** plain text; lines starting with "- " are shown as a list */
  body: string;
}

interface StepBase {
  id: string;
  title: string;
  /** one line shown in the path */
  short: string;
}
export interface LessonStep extends StepBase {
  kind: 'lesson';
  sections: LessonSection[];
  /** a page that helps practise it (a route) */
  link?: { to: string; label: string };
}
export interface CasesStep extends StepBase {
  kind: 'cases';
  setId: string;
  /** keeps only some cases of the set (by id) */
  ids?: string[];
  intro: string;
  /** a final optional step never blocks the next level */
  optional?: boolean;
}
export interface SolvesStep extends StepBase {
  kind: 'solves';
  /** this many full solves at or under `maxMs`, counted from when the level started */
  need: number;
  maxMs: number;
}
export type Step = LessonStep | CasesStep | SolvesStep;

export interface Level {
  id: LevelId;
  name: string;
  method: string;
  tagline: string;
  /** typical full-solve time at this level, in words */
  typical: string;
  steps: Step[];
}

export const BEGINNER: Level = {
  id: 'beginner',
  name: 'Beginner',
  method: 'Layer by layer',
  tagline: 'Learn to solve the cube from any scramble, one layer at a time.',
  typical: 'about 1.5 to 4 minutes',
  steps: [
    {
      id: 'b-basics',
      kind: 'lesson',
      title: 'Meet the cube',
      short: 'Notation, centres and the three kinds of piece.',
      sections: [
        {
          title: 'The centres never move',
          body: 'Each face has one centre that is fixed to the cube’s core. White opposite yellow, green opposite blue, red opposite orange: that never changes, so the centres tell you which colour belongs where.',
        },
        {
          title: 'Three kinds of piece',
          body: '- Centres: one colour, fixed.\n- Edges: two colours, 12 of them.\n- Corners: three colours, 8 of them.\nA piece always stays its own kind: an edge can never become a corner.',
        },
        {
          title: 'Notation: how algorithms are written',
          body: '- A letter is a clockwise quarter turn of that face as you look at it: R right, L left, U up, D down, F front, B back.\n- A tick (R′) is the same turn anticlockwise. A 2 (R2) is a half turn.\n- Every algorithm in this app is written that way. You will type them from memory later.',
        },
        {
          title: 'The plan',
          body: 'You will build a white cross, fill the first layer, add the middle layer, then finish the yellow top layer in four short steps. Each step is small enough to learn in one sitting.',
        },
      ],
    },
    {
      id: 'b-cross',
      kind: 'lesson',
      title: 'The white cross',
      short: 'Four white edges around the white centre, matching the side centres.',
      link: { to: '/cross', label: 'Practise on the Cross page' },
      sections: [
        {
          title: 'Goal',
          body: 'A white plus sign on one face, and each white edge’s other colour matches the centre next to it (the side of the cross is, for example, green on the green centre).',
        },
        {
          title: 'How',
          body: '- Find a white edge. Turn the layers until it sits next to the white centre without disturbing the cross pieces you already placed.\n- Line its second colour up with its centre, then turn that face a half turn to drop it into place.\n- There is no algorithm here: it is looking and thinking. Take your time; speed comes later.',
        },
        {
          title: 'You are done when',
          body: 'You can build the cross from a scramble without help, every time.',
        },
      ],
    },
    {
      id: 'b-corners',
      kind: 'lesson',
      title: 'First-layer corners',
      short: 'Fill the white layer with the corner trigger.',
      sections: [
        {
          title: 'The one move you need',
          body: 'Put the white cross on the bottom. Find a white corner on the top layer, turn the top until it is directly above its slot (between the two centres it matches), then repeat R′ D′ R D until it drops in with white facing down. One to five repeats; you will know it when the corner is solved.',
        },
        {
          title: 'If a white corner is stuck in the bottom layer',
          body: 'Put it above any slot, do R′ D′ R D once to lift it out, then place it as above.',
        },
        {
          title: 'Check',
          body: 'The whole white layer is solved and the row of colour around its edge matches the side centres.',
        },
      ],
    },
    {
      id: 'b-layer2',
      kind: 'cases',
      setId: 'beginner',
      ids: ['beginner-01', 'beginner-02', 'beginner-03'],
      title: 'Second layer',
      short: 'Move the four middle edges into place.',
      intro:
        'Turn the cube so the white layer is at the bottom. Find a top-layer edge with no yellow on it, match its front colour with the centre, then do the algorithm that sends it right or left.',
    },
    {
      id: 'b-cross2',
      kind: 'cases',
      setId: 'beginner',
      ids: ['beginner-04', 'beginner-05'],
      title: 'Yellow cross',
      short: 'Make a yellow cross on top.',
      intro:
        'Look at the yellow edges on top: a dot, an L shape or a line. Do the algorithm until a yellow cross appears. A line goes sideways; an L shape goes top-left corner.',
    },
    {
      id: 'b-corners2',
      kind: 'cases',
      setId: 'beginner',
      ids: ['beginner-06', 'beginner-07', 'beginner-11'],
      title: 'Yellow corners',
      short: 'Turn all four yellow corners up.',
      intro:
        'With the cross done, count the yellow stickers on top: Sune and Anti-Sune twist the corners until the whole top is yellow. The corner twist is the fallback when a single corner is flipped.',
    },
    {
      id: 'b-position',
      kind: 'cases',
      setId: 'beginner',
      ids: ['beginner-08', 'beginner-09', 'beginner-10'],
      title: 'Finish the cube',
      short: 'Put the last-layer pieces in their places.',
      intro:
        'Swap the corners into place first, then cycle the three wrong edges. After these your cube is solved.',
    },
    {
      id: 'b-solve',
      kind: 'solves',
      title: 'Solve it from a scramble',
      short: 'Three full solves in under 3 minutes each.',
      need: 3,
      maxMs: 180000,
    },
  ],
};

export const INTERMEDIATE: Level = {
  id: 'intermediate',
  name: 'Intermediate',
  method: 'CFOP, 2-look last layer',
  tagline: 'Solve in around a minute: smooth cross, F2L pairs and a two-step last layer.',
  typical: 'about 40 to 90 seconds',
  steps: [
    {
      id: 'i-cross',
      kind: 'lesson',
      title: 'Plan the cross during inspection',
      short: 'Solve the cross in 8 moves or fewer, planned before you start.',
      link: { to: '/cross', label: 'Cross solver and trainer' },
      sections: [
        {
          title: 'Look first, then move',
          body: 'During the 15 s of inspection find the white edges and plan the whole cross. When the timer starts you only execute the plan. That is what makes the rest of the solve smooth.',
        },
        {
          title: 'Habits that matter',
          body: '- Aim for 8 moves or fewer; the cross solver on the Cross page shows what is possible.\n- Choose where the next F2L pair will be while you finish the cross.\n- Practise with the timer’s inspection switched on.',
        },
      ],
    },
    {
      id: 'i-f2l',
      kind: 'cases',
      setId: 'f2l-basic',
      title: 'First two layers (F2L)',
      short: 'Pair up each corner and edge and insert them together.',
      intro:
        'F2L solves the corner and its edge as a pair. The cases are grouped by where the two pieces are. Learn them a few at a time; recognise the case first, then execute.',
    },
    {
      id: 'i-oll',
      kind: 'cases',
      setId: '2lookoll',
      title: '2-look OLL',
      short: 'Make the top yellow in two steps: edges, then corners.',
      intro:
        'Step one makes the yellow cross (3 cases), step two turns the corners yellow (7 cases). Ten algorithms in total.',
    },
    {
      id: 'i-pll',
      kind: 'cases',
      setId: '2lookpll',
      title: '2-look PLL',
      short: 'Finish the cube: corners, then edges.',
      intro:
        'Place the corners (2 cases), then cycle the last three edges (4 cases). Six algorithms and you can solve every cube.',
    },
    {
      id: 'i-solve',
      kind: 'solves',
      title: 'Solve in under a minute',
      short: 'Five full solves in under 60 seconds.',
      need: 5,
      maxMs: 60000,
    },
  ],
};

export const ADVANCED: Level = {
  id: 'advanced',
  name: 'Advanced',
  method: 'Full CFOP',
  tagline: 'Go sub-30: one look for the whole last layer, and F2L without pauses.',
  typical: 'under 40 seconds',
  steps: [
    {
      id: 'a-pll',
      kind: 'cases',
      setId: 'pll',
      title: 'Full PLL',
      short: 'All 21 permutations of the last layer.',
      intro:
        'Recognise a PLL from the headlights and the colours around the top, not by counting stickers. Learn the ones you meet most often first.',
    },
    {
      id: 'a-oll',
      kind: 'cases',
      setId: 'oll',
      title: 'Full OLL',
      short: 'All 57 orientations of the last layer.',
      intro:
        'Group them by shape (dot, line, L, T...) and learn a shape at a time, so recognition and recall build together.',
    },
    {
      id: 'a-f2l',
      kind: 'cases',
      setId: 'f2l-adv',
      title: 'F2L: advanced cases',
      short: 'The awkward pairs that cost time.',
      intro:
        'Pairs that are stuck in the wrong slot or flipped. Knowing these removes the pauses from the middle of your solve.',
    },
    {
      id: 'a-f2l-expert',
      kind: 'cases',
      setId: 'f2l-expert',
      title: 'F2L: expert cases',
      short: 'Rare, tricky situations.',
      intro: 'Less common, so keep them last. They are worth it once the rest is automatic.',
      optional: true,
    },
    {
      id: 'a-solve',
      kind: 'solves',
      title: 'Solve in under 30 seconds',
      short: 'Five full solves in under 30 seconds.',
      need: 5,
      maxMs: 30000,
    },
    {
      id: 'a-coll',
      kind: 'cases',
      setId: 'coll',
      title: 'Extra: COLL',
      short: 'Orient and place the corners in one go.',
      intro: 'Optional: it makes the last step shorter once full PLL is automatic.',
      optional: true,
    },
  ],
};

export const LEVELS: Record<LevelId, Level> = {
  beginner: BEGINNER,
  intermediate: INTERMEDIATE,
  advanced: ADVANCED,
};

// ---------------------------------------------------------------------------------------------
// Placement and level checks

/** A full solve at or above this is a Beginner; below it, Intermediate; below the next, Advanced. */
export const GATES: Record<'intermediate' | 'advanced', number> = {
  intermediate: 90000,
  advanced: 30000,
};

/** The level a first timed solve points to. A DNF or "could not solve it" is Beginner. */
export function placeLevel(timeMs: number | null): LevelId {
  if (timeMs === null) return 'beginner';
  if (timeMs < GATES.advanced) return 'advanced';
  if (timeMs < GATES.intermediate) return 'intermediate';
  return 'beginner';
}

export const isFullSolve = (s: Solve): boolean =>
  s.mode === 'random' && (!s.stage || s.stage === 'full');

/** WCA-style average of five: drop the best and the worst, mean of the rest. A DNF counts as the worst. */
export function averageOfFive(solves: Solve[]): number | null {
  if (solves.length < 5) return null;
  const t = solves.slice(-5).map((s) => effective(s) ?? Infinity);
  const sorted = [...t].sort((a, b) => a - b);
  const mid = sorted.slice(1, 4);
  const mean = mid.reduce((a, b) => a + b, 0) / 3;
  return Number.isFinite(mean) ? mean : null;
}

export interface LevelCheck {
  action: 'promote' | 'demote' | 'stay';
  to?: LevelId;
  /** the average of the last five full solves, ms */
  ao5: number | null;
  reason: string;
}

/**
 * Looks at the newest five full solves made since the person last changed level.
 * Up one level when the average beats the next gate with a little room; down one when it is clearly
 * slower than this level's own entry gate. The gap between the two stops a level from flipping back
 * and forth on a good or a bad day.
 */
export function levelCheck(level: LevelId, solves: Solve[], sinceMs = 0): LevelCheck {
  const full = solves.filter((s) => isFullSolve(s) && s.at > sinceMs);
  const ao5 = averageOfFive(full);
  if (ao5 === null)
    return {
      action: 'stay',
      ao5,
      reason: `${Math.max(0, 5 - full.length)} more full solves are needed to check your level.`,
    };
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  if (level === 'beginner' && ao5 < GATES.intermediate * 0.95)
    return {
      action: 'promote',
      to: 'intermediate',
      ao5,
      reason: `Your last five solves average ${s(ao5)}. That is Intermediate speed.`,
    };
  if (level === 'intermediate' && ao5 < GATES.advanced * 0.95)
    return {
      action: 'promote',
      to: 'advanced',
      ao5,
      reason: `Your last five solves average ${s(ao5)}. That is Advanced speed.`,
    };
  if (level === 'intermediate' && ao5 > GATES.intermediate * 1.4)
    return {
      action: 'demote',
      to: 'beginner',
      ao5,
      reason: `Your last five solves average ${s(ao5)}. Beginner steps will rebuild the base.`,
    };
  if (level === 'advanced' && ao5 > GATES.advanced * 1.4)
    return {
      action: 'demote',
      to: 'intermediate',
      ao5,
      reason: `Your last five solves average ${s(ao5)}. Intermediate steps will tighten the middle of your solve.`,
    };
  return { action: 'stay', ao5, reason: `Your last five solves average ${s(ao5)}: right level.` };
}

// ---------------------------------------------------------------------------------------------
// Step progress

export interface StepProgress {
  step: Step;
  done: boolean;
  /** cases steps: how many cases there are, recalled from memory, and finished (fast enough) */
  total: number;
  recalled: number;
  finished: number;
  /** solves steps: how many solves qualify so far */
  count: number;
}

export interface ProgressInput {
  caseIds: (step: CasesStep) => string[];
  memory: Record<string, CaseMemory>;
  status: Record<string, CaseStatus>;
  stepsDone: string[];
  solves: Solve[];
  sinceMs: number;
}

export function stepProgress(step: Step, inp: ProgressInput): StepProgress {
  const base: StepProgress = { step, done: false, total: 0, recalled: 0, finished: 0, count: 0 };
  if (step.kind === 'lesson') return { ...base, done: inp.stepsDone.includes(step.id) };
  if (step.kind === 'solves') {
    const count = inp.solves.filter(
      (s) => isFullSolve(s) && s.at > inp.sinceMs && (effective(s) ?? Infinity) <= step.maxMs,
    ).length;
    return { ...base, count, done: count >= step.need };
  }
  const ids = inp.caseIds(step);
  const recalled = ids.filter((id) => isRecalled(inp.memory[id])).length;
  const finished = ids.filter((id) => inp.status[id] === 'finished').length;
  return {
    ...base,
    total: ids.length,
    recalled,
    finished,
    done: ids.length > 0 && recalled === ids.length,
  };
}

/** The first step of the level that is not done (null when the whole level is). Optional steps never block. */
export function currentStep(rows: StepProgress[]): StepProgress | null {
  return rows.find((r) => !r.done && !('optional' in r.step && r.step.optional)) ?? null;
}

/** Cases come in small groups so only a few new algorithms are in your head at once. */
export const BATCH = 3;

export function batchesOf(ids: string[], size = BATCH): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** The group of cases to work on now: the first one that still has a case not recalled. */
export function activeBatch(
  ids: string[],
  memory: Record<string, CaseMemory>,
  size = BATCH,
): string[] {
  return batchesOf(ids, size).find((b) => b.some((id) => !isRecalled(memory[id]))) ?? [];
}
