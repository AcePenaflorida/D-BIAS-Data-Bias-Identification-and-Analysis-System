import { Card } from './ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { AnalysisResult } from '../App';

interface SidePanelProps {
  assessment: {
    fairness: string;
    recommendations: string[];
    conclusion: string;
  };
  fairnessLabel: string;
  history?: AnalysisResult[];
  onPreviewHistory?: (r: AnalysisResult) => void;
}

export function SidePanel({ assessment, fairnessLabel }: SidePanelProps) {
  const getFairnessColor = (label: string) => {
    switch (label) {
      case 'Excellent':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'Good':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'Fair':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'Poor':
        return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'Critical':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <aside className="w-80 flex-shrink-0 hidden lg:block">
      <div className="sticky top-24">
        <Card className="p-6">
          <h3 className="text-slate-900 mb-4">Assessment</h3>

          {/* Fairness */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-slate-700">Fairness</h4>
              <span className={`px-2 py-1 rounded-full text-xs border ${getFairnessColor(fairnessLabel)}`}>
                {fairnessLabel}
              </span>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">{assessment.fairness}</p>
          </div>

          {/* Actionable Recommendations */}
          <div className="mb-6">
            <h4 className="text-slate-700 mb-3">Actionable Recommendations</h4>
            <div className="space-y-2">
              {assessment.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-600 text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Conclusion */}
          <div>
            <h4 className="text-slate-700 mb-2">Conclusion</h4>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-900 text-sm leading-relaxed">{assessment.conclusion}</p>
            </div>
          </div>
        </Card>
          {/* history moved to left panel */}
      </div>
    </aside>
  );
}
