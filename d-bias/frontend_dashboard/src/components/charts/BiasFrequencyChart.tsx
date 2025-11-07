import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BiasFrequencyChartProps {
  biases: Array<{
    bias_type: string;
    severity: string;
  }>;
}

export function BiasFrequencyChart({ biases }: BiasFrequencyChartProps) {
  const severityScore = {
    Low: 1,
    Moderate: 2,
    High: 3,
    Critical: 4,
  };

  const data = biases.map((bias) => ({
    type: bias.bias_type.split(' ').slice(0, 2).join(' '),
    score: severityScore[bias.severity as keyof typeof severityScore] || 1,
    severity: bias.severity,
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
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="type" stroke="#64748b" tick={{ fontSize: 11 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
          }}
        />
        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getColor(entry.severity)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
