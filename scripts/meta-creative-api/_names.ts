import 'dotenv/config';
import { fetchCreatives } from './metaApi.ts';
import { normalizeAdName } from '../../src/creative/aggregate.ts';

const data = await fetchCreatives({ datePreset: 'last_90d' });

// Group by creative key, collect member names + spend.
const groups = new Map<string, { spend: number; names: Set<string> }>();
for (const r of data.rows) {
  const k = normalizeAdName(r.adName, 'creative');
  const g = groups.get(k) ?? { spend: 0, names: new Set() };
  g.spend += r.metrics.spend;
  g.names.add(r.adName);
  groups.set(k, g);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].spend - a[1].spend);
console.log(`rows=${data.rows.length}  distinctNames=${new Set(data.rows.map((r) => r.adName)).size}  creativeGroups=${groups.size}\n`);
for (const [key, g] of sorted.slice(0, 30)) {
  console.log(`$${Math.round(g.spend).toString().padStart(7)}  [${g.names.size}]  «${key}»`);
  if (g.names.size > 1) for (const n of g.names) console.log(`             - ${n}`);
}
