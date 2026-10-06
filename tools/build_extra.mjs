// Extra training scenarios, all verified with the cube engine before they are written.
//
//   node tools/build_extra.mjs data/algs.json [--write]
//
//  beginner   Beginner-method steps (layer-2 edges, last-layer corners) as single cases
//  ollpll     Full last layer: one OLL + one PLL in a row (OLL first, then PLL), the real CFOP LL practice
//  f2l-chain  3-4 F2L pairs at once, built from several F2L algorithms in a row (cross solved)
import { readFileSync, writeFileSync } from 'node:fs';
import { Cube, parseMoves, invertMoves, caseScramble, f2lReport } from '../web/src/app/core/cube.ts';

const [algsPath, flag] = process.argv.slice(2);
const data = JSON.parse(readFileSync(algsPath, 'utf8'));
const problems = [];

// small deterministic random generator so the generated sets are stable between runs
let seed = 20261006;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rng() * a.length)];

/** the alg must solve its own scramble (the whole cube, up to a final U turn) */
function solvesWholeCube(alg) {
  const cs = caseScramble(alg, () => 0, false);
  return new Cube().apply(cs.scramble).apply(alg).isSolvedUpToAuf();
}

const out = [];
const add = (set, name, group, alg, extra = {}) => out.push({ id: `${set}-${String(out.filter((c) => c.set === set).length + 1).padStart(2, '0')}`, set, name, group, alg, img: null, ...extra });

// ------------------------------------------------------------------ beginner
const BEGINNER = [
  ['Layer 2', 'Edge goes to the right (front-right slot)', "U R U' R' U' F' U F"],
  ['Layer 2', 'Edge goes to the left (front-left slot)', "U' L' U L U F U' F'"],
  ['Layer 2', 'Edge stuck in the slot, wrong way (front-right)', "R U' R' U' F' U F U' R U' R' U' F' U F"],
  ['Last layer', 'Yellow cross: line (from L shape / dot too)', "F R U R' U' F'"],
  ['Last layer', 'Yellow cross: dot / L shape', "F U R U' R' F'"],
  ['Last layer', 'Yellow corners: Sune', "R U R' U R U2 R'"],
  ['Last layer', 'Yellow corners: Anti-Sune', "R U2 R' U' R U' R'"],
  ['Last layer', 'Corner placement (swap two corners)', "U R U' L' U R' U' L"],
  ['Last layer', 'Edge placement (3-cycle clockwise)', "R U' R U R U R U' R' U' R2"],
  ['Last layer', 'Edge placement (3-cycle anti-clockwise)', "R2 U R U R' U' R' U' R' U R'"],
  ['Last layer', 'Corner twist (R U R\' U\' repeated)', "R U R' U' R U R' U'"],
];
for (const [g, n, alg] of BEGINNER) {
  try {
    const cs = caseScramble(alg, () => 0, false);
    const c = new Cube().apply(cs.scramble);
    const r = f2lReport(c);
    // the scramble must be a real case: solving it with the algorithm restores the cube
    if (!solvesWholeCube(alg)) problems.push(`beginner: does not solve itself: ${alg}`);
    if (!r.crossSolved) problems.push(`beginner: cross broken by ${alg}`);
    add('beginner', n, g, alg);
  } catch (e) {
    problems.push(`beginner ${alg}: ${e.message}`);
  }
}

// -------------------------------------------------------------------- ollpll
const olls = data.cases.filter((c) => c.set === 'oll');
const plls = data.cases.filter((c) => c.set === 'pll');
for (const o of olls) {
  const p = pick(plls);
  const alg = `${o.alg} ${p.alg}`;
  const cs = caseScramble(alg, () => 0, false);
  const st = new Cube().apply(cs.scramble);
  const r = f2lReport(st);
  if (!(r.crossSolved && r.unsolvedSlots.length === 0)) {
    problems.push(`ollpll: F2L not preserved for ${o.name} + ${p.name}`);
    continue;
  }
  add('ollpll', `${o.name} → ${p.name}`, o.group, alg, { algs: [{ alg: o.alg }, { alg: p.alg }], setup: cs.scramble });
}

// ----------------------------------------------------------------- f2l-chain
const f2l = data.cases.filter((c) => c.set.startsWith('f2l-') && c.slots.length === 1);
let tries = 0;
while (out.filter((c) => c.set === 'f2l-chain').length < 40 && tries++ < 20000) {
  const n = 3 + Math.floor(rng() * 2);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(f2l));
  const alg = parts.map((c) => c.alg).join(' ');
  let cs;
  try {
    cs = caseScramble(alg, () => 0, false);
  } catch {
    continue;
  }
  const st = new Cube().apply(cs.scramble);
  const r = f2lReport(st);
  if (!r.crossSolved || r.unsolvedSlots.length < 3) continue;
  if (cs.scramble.split(' ').length > 60) continue;
  add('f2l-chain', `${r.unsolvedSlots.length} pairs #${out.filter((c) => c.set === 'f2l-chain').length + 1}`, `${r.unsolvedSlots.length} unsolved slots`, alg, {
    algs: parts.map((c) => ({ alg: c.alg })),
    setup: cs.scramble,
    slots: r.unsolvedSlots,
  });
}

const counts = {};
for (const c of out) counts[c.set] = (counts[c.set] ?? 0) + 1;
console.log('built:', JSON.stringify(counts));
console.log(problems.length ? problems.join('\n') : 'no problems');

if (flag === '--write') {
  const ids = ['beginner', 'ollpll', 'f2l-chain'];
  data.sets = data.sets.filter((s) => !ids.includes(s.id));
  data.cases = data.cases.filter((c) => !ids.includes(c.set));
  const labels = { beginner: ['Beginner method', 'beginner'], ollpll: ['Last layer: OLL + PLL', 'll'], 'f2l-chain': ['F2L: several pairs', 'f2l'] };
  for (const id of ids) data.sets.push({ id, label: labels[id][0], kind: labels[id][1], count: counts[id] ?? 0 });
  data.cases.push(...out);
  writeFileSync(algsPath, JSON.stringify(data, null, 1));
  console.log('written', algsPath);
}
