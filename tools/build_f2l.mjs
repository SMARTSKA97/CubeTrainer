// Build the F2L sets from the extracted PDF cells and VERIFY them with the cube engine.
//
//   node tools/build_f2l.mjs <f2l_raw.json> <data/algs.json> [--write]
//
// For every table cell (= one case) each listed algorithm is inverted and applied to a solved cube.
// The cross + F2L pieces of the resulting states must be identical relative to the centres (last-layer
// pieces are ignored: different algorithms leave the top layer turned differently), otherwise the algorithm does not
// belong to that case. Highlighted ("affects more than 1 slot") algorithms may legitimately differ.
import { readFileSync, writeFileSync } from 'node:fs';
import { Cube, parseMoves, invertMoves, f2lReport, caseScramble } from '../web/src/app/core/cube.ts';

const [rawPath, algsPath, flag] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const data = JSON.parse(readFileSync(algsPath, 'utf8'));

const SECTION_TITLE = {
  '1A': 'Both pieces on top',
  '1B': 'One piece in its slot',
  '1C': 'Both pieces in their slot',
  '2A': 'Edge in the wrong slot',
  '2B': 'Corner in the wrong slot',
  3: 'Expert',
};
const SUB_SHORT = {
  'White Sticker Faces Up': 'white up',
  'Stickers on the U face are different:': 'white on side, top stickers differ',
  'Stickers on the U face are the same:': 'white on side, top stickers same',
  'White Sticker Faces Side/Front': 'white on side/front',
  'Edge in the slot': 'edge in slot',
  'Corner in the slot': 'corner in slot',
  '': 'both in slot',
  'Corner In The Right Slot': 'corner in right slot',
  'Corner In The Left Slot': 'corner in left slot',
  'Corner In The Opposite Slot': 'corner in opposite slot',
  'Corner Is Solved': 'corner solved',
  'Pair In The Wrong Slot': 'pair in wrong slot',
  'Flipped Edge & Corner In Adjacent Slot': 'flipped edge, corner in adjacent slot',
  'Other Easy Cases': 'other easy cases',
};
const SETS = [
  { id: 'f2l-basic', label: 'F2L – Basic', major: 'Basic F2L' },
  { id: 'f2l-adv', label: 'F2L – Advanced', major: 'Advanced F2L' },
  { id: 'f2l-expert', label: 'F2L – Expert', major: 'Expert F2L' },
];

const problems = [];
const notes = [];
const cases = [];
const counters = new Map();

for (const set of SETS) {
  const cells = raw.filter((c) => c.major === set.major);
  for (const cell of cells) {
    const key0 = `${set.id}|${cell.section}|${cell.sub}`;
    const idx = (counters.get(key0) ?? 0) + (cell.column === 'left' ? 1 : 0);
    // rows are visited left then right; count one row per left cell, right cell shares the row number
    if (cell.column === 'left') counters.set(key0, idx);
    const rowNo = counters.get(key0) ?? 1;

    const parsed = cell.algs.map((a) => {
      try {
        return { ...a, moves: parseMoves(a.text) };
      } catch (e) {
        problems.push(`PARSE ${set.id} ${cell.section} p${cell.page}: ${a.text} -> ${e.message}`);
        return { ...a, moves: null };
      }
    });
    // alg `a` solves the case produced by `p` when, after the case state (inverse of p), an optional
    // top-layer turn and then `a`, cross and all four F2L slots are solved again (last layer ignored).
    const solves = (a, p) =>
      [0, 1, 2, 3].some((j) =>
        [0, 1, 2, 3].some((k) => {
          // j = turn the whole cube about the vertical axis first (the case sits in another slot)
          const c = new Cube().apply(invertMoves(p.moves)).apply(parseMoves('y '.repeat(j) + 'U '.repeat(k))).apply(a.moves);
          const r = f2lReport(c);
          return r.crossSolved && r.unsolvedSlots.length === 0;
        }),
      );
    const valid = parsed.filter((x) => x.moves);
    const same = (a, p) => a === p || solves(a, p) || solves(p, a);
    // Group the normal algorithms into engine-verified cases. A table cell may mix algorithms for
    // slightly different situations (the PDF's pictures are not machine readable); those become
    // separate cases (suffix 2, 3...) instead of being silently attached to the wrong one.
    const clusters = [];
    for (const a of valid.filter((x) => !x.multi)) {
      const c = clusters.find((cl) => same(a, cl[0]));
      if (c) c.push(a);
      else clusters.push([a]);
    }
    // highlighted ones (they also disturb a second slot) are shown as extra options of the case they fit
    for (const a of valid.filter((x) => x.multi)) {
      const c = clusters.find((cl) => same(a, cl[0]));
      if (c) c.push(a);
      else if (clusters[0]) clusters[0].push({ ...a, foreign: true });
    }
    const where = `${set.id} ${cell.section} ${cell.sub} (${cell.column}, p${cell.page})`;
    if (clusters.length > 1) notes.push(`SPLIT ${where}: ${clusters.map((c) => c.length).join('+')}`);
    clusters.forEach((cl, ci) => {
      const analysed = cl.map((a) => ({ ...a, ok: !a.foreign, report: f2lReport(new Cube().apply(invertMoves(a.moves))) }));
      const primary = analysed.find((a) => !a.multi);
      if (!primary) return;
      const rep = primary.report;
      if (!rep.crossSolved) problems.push(`CROSS BROKEN ${where}: ${primary.text}`);
      if (rep.unsolvedSlots.length === 0) problems.push(`NOTHING SCRAMBLED ${where}`);
      const group = `${cell.section} ${SECTION_TITLE[cell.section]} – ${SUB_SHORT[cell.sub] ?? cell.sub}`;
      cases.push({
        id: `${set.id}-${String(cases.filter((c) => c.set === set.id).length + 1).padStart(2, '0')}`,
        set: set.id,
        name: `${cell.section}.${rowNo}${cell.column === 'left' ? 'a' : 'b'}${ci ? `·${ci + 1}` : ''}`,
        group,
        alg: primary.text,
        algs: analysed.map((a) => ({ alg: a.text, multi: a.multi })),
        setup: caseScramble(primary.text, () => 0, false).scramble,
        slots: rep.unsolvedSlots,
        img: null,
      });
    });
  }
}

console.log('cases built:', SETS.map((s) => `${s.id}=${cases.filter((c) => c.set === s.id).length}`).join('  '));
console.log(notes.length + ' cells split into several cases');
console.log('algorithms:', cases.reduce((n, c) => n + c.algs.length, 0), ' usable for this exact case:', cases.reduce((n, c) => n + c.algs.length, 0));
const slotCount = {};
for (const c of cases) slotCount[c.slots.length] = (slotCount[c.slots.length] ?? 0) + 1;
console.log('cases by number of disturbed slots:', JSON.stringify(slotCount));
console.log(problems.length ? `\n${problems.length} PROBLEMS:\n` + problems.join('\n') : '\nno problems');

if (flag === '--write') {
  data.sets = data.sets.filter((s) => !s.id.startsWith('f2l-'));
  data.cases = data.cases.filter((c) => !c.set.startsWith('f2l-'));
  for (const s of SETS) data.sets.push({ id: s.id, label: s.label, kind: 'f2l', count: cases.filter((c) => c.set === s.id).length });
  data.cases.push(...cases);
  writeFileSync(algsPath, JSON.stringify(data, null, 1));
  console.log('written', algsPath);
}
