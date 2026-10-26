// Summarises the Postgres slow-query log: reads log text on stdin (docker logs dhoblio-postgres), groups statements by
// shape (literals and parameters removed) and prints the heaviest first. Usage:
//   docker logs dhoblio-postgres --since 10m 2>&1 | node ops/perf/slow-queries.js [top=12]
const top = Number(process.argv[2] || 12);
let text = '';
process.stdin.on('data', (d) => (text += d)).on('end', () => {
  const lines = text.split(/\r?\n/);
  const groups = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /LOG:\s+duration: ([\d.]+) ms\s+(?:statement|execute [^:]*): (.*)$/.exec(lines[i]);
    if (!m) continue;
    let sql = m[2];
    // statements continue on following lines until the next log record
    for (let j = i + 1; j < lines.length && !/^\d{4}-\d\d-\d\d /.test(lines[j]) && !/^DETAIL:/.test(lines[j].trim()); j++) sql += ' ' + lines[j].trim();
    const key = sql.replace(/\s+/g, ' ').replace(/'[^']*'/g, "'?'").replace(/\$\d+/g, '$?').replace(/\b\d+(\.\d+)?\b/g, 'N').slice(0, 400);
    const g = groups.get(key) ?? { n: 0, total: 0, max: 0, sample: sql.replace(/\s+/g, ' ') };
    const ms = Number(m[1]);
    g.n++;
    g.total += ms;
    g.max = Math.max(g.max, ms);
    groups.set(key, g);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, top);
  for (const [key, g] of rows) console.log(`${String(g.n).padStart(6)} calls  total ${g.total.toFixed(0).padStart(7)} ms  avg ${(g.total / g.n).toFixed(1).padStart(7)}  max ${g.max.toFixed(0).padStart(6)}\n        ${key.slice(0, 330)}\n`);
  console.log(`${groups.size} distinct slow statements`);
});
