import React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { FileText, Eye } from 'lucide-react';
import type { AnalysisResult } from '../App';

interface HistoryListProps {
  history: AnalysisResult[];
  onPreview: (r: AnalysisResult) => void;
}

export function HistoryList({ history, onPreview }: HistoryListProps) {
  if (!history || history.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-slate-900 mb-2">History</h3>
        <p className="text-sm text-slate-600">No past analyses yet. Your uploaded datasets will appear here.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-slate-900 mb-3">Analysis History</h3>
      <div className="space-y-3">
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-3 p-3 border border-slate-100 rounded-md bg-white">
            <div>
              <div className="text-slate-800 font-medium">{h.datasetName}</div>
              <div className="text-slate-500 text-sm">{new Date(h.uploadDate).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onPreview(h)}>
                <Eye className="w-4 h-4 mr-2" /> Preview
              </Button>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 text-sm flex items-center gap-1">
                <FileText className="w-4 h-4" /> PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
