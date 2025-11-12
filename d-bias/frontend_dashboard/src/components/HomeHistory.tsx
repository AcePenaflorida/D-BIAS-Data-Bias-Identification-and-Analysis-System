import React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import FairnessDonut from './charts/FairnessDonut';
import { Clock } from 'lucide-react';
import type { AnalysisResult } from '../App';

const getFairnessPill = (label?: AnalysisResult['fairnessLabel']) => {
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

interface HomeHistoryProps {
  history: AnalysisResult[];
  onPreview: (r: AnalysisResult) => void;
  onOpen: (r: AnalysisResult) => void;
}

export function HomeHistory({ history, onPreview, onOpen }: HomeHistoryProps) {
  // Keep the full history array but we'll constrain the visible area to show 3 items
  // and make the container scrollable when there are more than 3 items.
  const recent = (history && history.length > 0) ? history : [];

  // If empty, show a friendly placeholder that appears on the home/upload page
  if (recent.length === 0) {
    return (
      <section className="mt-8">
        <Card className="p-6 bg-gradient-to-r from-white via-slate-50 to-white border border-slate-100 rounded-xl">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <Clock className="w-6 h-6 text-slate-400" />
            </div>

            <div className="w-full">
              <h3 className="text-slate-900 text-lg font-semibold">Analysis History</h3>
              <p className="text-slate-500 text-sm mt-1">Your past dataset analyses will appear here. Run an analysis to populate your history.</p>
              <div className="mt-4">
                <Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="shadow-sm">Upload dataset</Button>
              </div>
            </div>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-slate-900 text-lg font-semibold">Recent analyses</h2>
      </div>

  {/* Constrain visible height and allow internal scrolling so the page doesn't scroll instead */}
  {/* Show roughly 3 cards worth of height and scroll when there are more items */}
  <div className={`flex flex-col gap-4 max-h-[360px] overflow-y-auto pr-2`}> 
        {recent.map((h) => (
          <Card key={h.id} className="max-w-3xl mx-auto min-h-[120px] p-4 hover:shadow-lg transition-shadow rounded-lg border border-slate-100 bg-white">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 flex items-center justify-center">
                <FairnessDonut score={h.fairnessScore} size={56} strokeWidth={8} showCenterText={false} />
              </div>
              <div className="w-full">
                <div className="flex items-center justify-center gap-2">
                  <div className="text-sm text-slate-700 font-medium truncate">{h.datasetName}</div>
                  <div className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${getFairnessPill(h.fairnessLabel)}`}>
                    {h.fairnessLabel}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-2">{new Date(h.uploadDate).toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" onClick={() => onPreview(h)}>Preview</Button>
              <Button size="sm" onClick={() => onOpen(h)}>Open</Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
