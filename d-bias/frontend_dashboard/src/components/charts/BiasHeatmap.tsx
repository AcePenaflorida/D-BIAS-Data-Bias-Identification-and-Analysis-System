interface BiasHeatmapProps {
  biases: Array<{
    column: string;
    severity: string;
  }>;
}

export function BiasHeatmap({ biases }: BiasHeatmapProps) {
  const severityScore = {
    Low: 1,
    Moderate: 2,
    High: 3,
    Critical: 4,
  };

  const getColor = (severity: string) => {
    switch (severity) {
      case 'Low':
        return 'bg-green-200';
      case 'Moderate':
        return 'bg-yellow-300';
      case 'High':
        return 'bg-orange-400';
      case 'Critical':
        return 'bg-red-500';
      default:
        return 'bg-slate-200';
    }
  };

  const columns = Array.from(new Set(biases.flatMap((b) => b.column.split(', '))));

  return (
    <div className="space-y-2">
      {columns.map((column) => {
        const columnBiases = biases.filter((b) => b.column.includes(column));
        const maxSeverity = Math.max(
          ...columnBiases.map((b) => severityScore[b.severity as keyof typeof severityScore] || 0)
        );
        const severity = Object.keys(severityScore).find(
          (key) => severityScore[key as keyof typeof severityScore] === maxSeverity
        ) || 'Low';

        return (
          <div key={column} className="flex items-center gap-3">
            <div className="w-24 text-sm text-slate-700 truncate" title={column}>
              {column}
            </div>
            <div className="flex-1 h-8 flex items-center">
              <div
                className={`h-full rounded ${getColor(severity)}`}
                style={{ width: `${(maxSeverity / 4) * 100}%` }}
              />
            </div>
            <div className="w-16 text-sm text-slate-600 text-right">{severity}</div>
          </div>
        );
      })}
    </div>
  );
}
