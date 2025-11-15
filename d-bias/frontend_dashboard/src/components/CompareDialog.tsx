import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { AnalysisResult } from '../App';
import { Button } from './ui/button';

interface CompareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  left: AnalysisResult | null;
  right: AnalysisResult | null;
}

function metricRow(label: string, leftVal: any, rightVal: any) {
  const bothNumeric = typeof leftVal === 'number' && typeof rightVal === 'number';
  let delta: string | null = null;
  if (bothNumeric) {
    const diff = (leftVal as number) - (rightVal as number);
    if (diff !== 0) delta = diff > 0 ? `+${diff}` : `${diff}`;
  }
  return (
    <tr className="border-t">
      <th className="text-left py-1 pr-4 font-medium text-slate-700 w-40 text-sm">{label}</th>
      <td className="py-1 text-sm text-slate-900">{String(leftVal ?? '—')}</td>
      <td className="py-1 text-sm text-slate-900">{String(rightVal ?? '—')}</td>
      <td className="py-1 text-xs text-slate-600 w-16">{delta}</td>
    </tr>
  );
}

export function CompareDialog({ isOpen, onClose, left, right }: CompareDialogProps) {
  if (!left || !right) return null;
  const leftSev = left.severitySummary || {};
  const rightSev = right.severitySummary || {};
  const sevKeys = Array.from(new Set([...Object.keys(leftSev), ...Object.keys(rightSev)])).sort();
  const leftBiasIds = new Set(left.detectedBiases.map(b => b.bias_type + '|' + b.column));
  const rightBiasIds = new Set(right.detectedBiases.map(b => b.bias_type + '|' + b.column));
  const leftOnly = [...leftBiasIds].filter(id => !rightBiasIds.has(id));
  const rightOnly = [...rightBiasIds].filter(id => !leftBiasIds.has(id));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Analyses</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded p-3 bg-slate-50">
              <h3 className="text-sm font-semibold mb-1 text-slate-800">Left</h3>
              <p className="text-xs text-slate-600">{left.datasetName}</p>
              <p className="text-xs text-slate-500">{new Date(left.uploadDate).toLocaleString()}</p>
            </div>
            <div className="border rounded p-3 bg-slate-50">
              <h3 className="text-sm font-semibold mb-1 text-slate-800">Right</h3>
              <p className="text-xs text-slate-600">{right.datasetName}</p>
              <p className="text-xs text-slate-500">{new Date(right.uploadDate).toLocaleString()}</p>
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 text-slate-600 font-medium">Metric</th>
                <th className="text-left py-1 text-slate-600 font-medium">Left</th>
                <th className="text-left py-1 text-slate-600 font-medium">Right</th>
                <th className="text-left py-1 text-slate-600 font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {metricRow('Fairness Score', left.fairnessScore, right.fairnessScore)}
              {metricRow('Bias Risk', left.biasRisk, right.biasRisk)}
              {metricRow('Fairness Label', left.fairnessLabel, right.fairnessLabel)}
              {metricRow('Reliability', left.reliabilityLevel, right.reliabilityLevel)}
              {metricRow('Total Biases', left.totalBiases ?? left.detectedBiases.length, right.totalBiases ?? right.detectedBiases.length)}
              {sevKeys.map(k => metricRow(`Severity ${k}`, (leftSev as any)[k] ?? 0, (rightSev as any)[k] ?? 0))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-1">Left Only Biases</h4>
              {leftOnly.length === 0 ? <p className="text-xs text-slate-500">None</p> : (
                <ul className="text-xs space-y-1 list-disc pl-4">
                  {leftOnly.map(id => <li key={id}>{id.replace('|', ' / ')}</li>)}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">Right Only Biases</h4>
              {rightOnly.length === 0 ? <p className="text-xs text-slate-500">None</p> : (
                <ul className="text-xs space-y-1 list-disc pl-4">
                  {rightOnly.map(id => <li key={id}>{id.replace('|', ' / ')}</li>)}
                </ul>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CompareDialog;