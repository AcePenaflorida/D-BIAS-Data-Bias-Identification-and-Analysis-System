import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface DistributionChartProps {
  data: Array<{ value: number; frequency: number }>;
}

export function DistributionChart({ data }: DistributionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="value"
          stroke="#64748b"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
        />
        <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
          }}
          labelFormatter={(value) => `Value: ${value.toLocaleString()}`}
        />
        <Area
          type="monotone"
          dataKey="frequency"
          stroke="#3b82f6"
          fill="#93c5fd"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
