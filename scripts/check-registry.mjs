import { loadRegistry } from '@dxp/batch';
const reg = loadRegistry('targets');
const r = Array.isArray(reg) ? reg : (reg.targets ?? reg.all ?? []);
const active = r.filter((t) => t.status === 'active');
console.log(`total ${r.length} · active ${active.length} · excluded ${r.length - active.length}`);
const byJ = {};
for (const t of r) {
  const j = t.jurisdiction ?? 'Commonwealth';
  byJ[j] ??= { a: 0, e: 0 };
  if (t.status === 'active') byJ[j].a++; else byJ[j].e++;
}
for (const [j, v] of Object.entries(byJ)) console.log(`  ${j.padEnd(30)} ${v.a} active / ${v.a + v.e}`);
