import { Card } from './ui/card';

type Row = {
  pair: string;
  r?: string;
  severity?: string;
};

export function BiasCorrelationTable({
  biases,
  title = 'Identical / Highly Correlated Features',
}: {
  biases: Array<{
    bias_type: string;
    column: string;
    description: string;
    severity?: string;
  }>;
  title?: string;
}) {
  const rows: Row[] = [];

  const corrRe = /r\s*=\s*(-?\d+(?:\.\d+)?)/i;
  const arrowSplitRe = /\s*[↔\-–>]+\s*/;

  for (const b of biases || []) {
    const type = (b.bias_type || '').toLowerCase();
    const desc = b.description || '';
    const looksCorr =
      type.includes('correlation') ||
      type.includes('identical') ||
      type.includes('directly') ||
      corrRe.test(desc);
    if (!looksCorr) continue;

    // Determine pair label
    let pair = b.column || '';
    if (!pair) {
      // attempt from description by grabbing tokens before r=
      const beforeR = desc.split(/r\s*=/i)[0] || '';
      const tokens = beforeR.split(/[:,]/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length >= 1) pair = tokens[tokens.length - 1];
    }
    // normalize pair label spacing
    pair = pair.split(arrowSplitRe).join(' ↔ ');
    if (!pair) pair = '—';

    // Extract correlation value if present
    const m = desc.match(corrRe);
    const r = m ? `r=${Number(m[1]).toFixed(3)}` : undefined;

    rows.push({ pair, r, severity: b.severity });
  }

  if (!rows.length) return null;

  return (
    <Card className="p-6">
      <h3 className="text-slate-900 mb-4">{title}</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-2 pr-4">Correlated Pair</th>
              <th className="py-2 pr-4">Correlation (r)</th>
              <th className="py-2 pr-4">Severity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-200">
                <td className="py-2 pr-4 text-slate-900 whitespace-nowrap">{row.pair}</td>
                <td className="py-2 pr-4 text-slate-700">{row.r || '—'}</td>
                <td className="py-2 pr-4 text-slate-700">{row.severity || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
