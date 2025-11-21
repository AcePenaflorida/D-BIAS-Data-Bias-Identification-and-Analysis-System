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
    // Utility to render explanation with bold and hashtag removal, and justify paragraph
    const renderExplanation = (text: string, className?: string) => {
      // Remove hashtags (lines or inline)
      let cleaned = text.replace(/#+/g, '');
      // Replace **text** with <strong>text</strong>
      cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <span
          className={className || "text-slate-600 text-sm leading-relaxed"}
          style={{ textAlign: 'justify', display: 'block' }}
          dangerouslySetInnerHTML={{ __html: cleaned }}
        />
      );
    };
  const getFairnessColor = (label: string) => {
    const key = (label || '').toLowerCase();
    switch (key) {
      case 'excellent':
      case 'high':
        // High fairness/excellent -> green
        return 'text-green-700 bg-green-50 border-green-200';
      case 'good':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'fair':
      case 'moderate':
        // Fair/moderate -> yellow
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'poor':
        // Poor -> red
        return 'text-red-700 bg-red-50 border-red-200';
      case 'critical':
        return 'text-red-800 bg-red-100 border-red-300';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <aside className="w-80 flex-shrink-0 hidden lg:block">
      <div className="sticky top-24">
        <Card className="p-6">
          {/* Fairness */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-slate-800 font-semibold tracking-wide uppercase border-l-4 border-indigo-500 pl-3">
                Fairness
              </h4>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium border ${getFairnessColor(fairnessLabel)} bg-white shadow-sm`}
              >
                {fairnessLabel}
              </span>
            </div>

            {renderExplanation(assessment.fairness)}
          </div>

          {/* Actionable Recommendations */}
          <div className="mb-6">
            <h4 className="text-slate-800 font-semibold tracking-wide uppercase border-l-4 border-green-500 pl-3 mb-3 drop-shadow-sm">Actionable Recommendations</h4>
            <div className="space-y-2">
              {assessment.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  {renderExplanation(rec)}
                </div>
              ))}
            </div>
          </div>

          {/* Conclusion */}
          <div>
            <h4 className="text-slate-800 font-semibold tracking-wide uppercase border-l-4 border-purple-500 pl-3 mb-2 drop-shadow-sm">Conclusion</h4>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              {renderExplanation(assessment.conclusion)}
            </div>
          </div>
        </Card>
          {/* history moved to left panel */}
      </div>
    </aside>
  );
}
