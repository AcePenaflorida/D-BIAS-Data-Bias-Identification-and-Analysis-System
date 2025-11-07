import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BiasDensityChartProps {
  biases: Array<{
    bias_type: string;
    column: string;
    severity: string;
  }>;
}

export function BiasDensityChart({ biases }: BiasDensityChartProps) {
  const severityScore = {
    Low: 1,
    Moderate: 2,
    High: 3,
    Critical: 4,
  };

  const data = biases.map((bias, idx) => ({
    x: idx,
    y: severityScore[bias.severity as keyof typeof severityScore] || 1,
    severity: bias.severity,
    type: bias.bias_type,
    column: bias.column,
  }));

  const getColor = (severity: string) => {
    switch (severity) {
      case 'Low':
        return '#10b981';
      case 'Moderate':
        return '#f59e0b';
      case 'High':
        return '#f97316';
      case 'Critical':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          dataKey="x"
          name="Bias Index"
          stroke="#64748b"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Severity"
          stroke="#64748b"
          tick={{ fontSize: 12 }}
          domain={[0, 4]}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
          }}
          content={({ payload }) => {
            if (payload && payload.length > 0) {
              const data = payload[0].payload;
              return (
                <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
                  <p className="text-sm text-slate-900 mb-1">{data.type}</p>
                  <p className="text-xs text-slate-600">Column: {data.column}</p>
                  <p className="text-xs text-slate-600">Severity: {data.severity}</p>
                </div>
              );
            }
            return null;
          }}
        />
        <Scatter data={data} fill="#3b82f6">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getColor(entry.severity)} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
