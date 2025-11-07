import { Download, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { AnalysisResult } from '../App';

interface PDFPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: AnalysisResult;
}

export function PDFPreviewDialog({ isOpen, onClose, result }: PDFPreviewDialogProps) {
  const handleDownload = () => {
    // In a real application, this would generate and download a PDF
    alert('PDF report would be downloaded here. This is a demo version.');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Low':
        return 'text-green-700';
      case 'Moderate':
        return 'text-yellow-700';
      case 'High':
        return 'text-orange-700';
      case 'Critical':
        return 'text-red-700';
      default:
        return 'text-slate-700';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>PDF Report Preview</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-white p-8">
          {/* PDF Content Preview */}
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center border-b border-slate-200 pb-6">
              <h1 className="text-slate-900 mb-2">D-BIAS Analysis Report</h1>
              <p className="text-slate-600">{result.datasetName}</p>
              <p className="text-slate-500 text-sm">
                Generated on {new Date(result.uploadDate).toLocaleDateString()}
              </p>
            </div>

            {/* Executive Summary */}
            <div>
              <h2 className="text-slate-900 mb-3">Executive Summary</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="border border-slate-200 rounded p-3">
                  <p className="text-slate-500 text-sm mb-1">Fairness Score</p>
                  <p className="text-slate-900 text-xl">{result.fairnessScore}/100</p>
                </div>
                <div className="border border-slate-200 rounded p-3">
                  <p className="text-slate-500 text-sm mb-1">Bias Risk</p>
                  <p className="text-slate-900 text-xl">{result.biasRisk}</p>
                </div>
                <div className="border border-slate-200 rounded p-3">
                  <p className="text-slate-500 text-sm mb-1">Fairness Label</p>
                  <p className="text-slate-900 text-xl">{result.fairnessLabel}</p>
                </div>
                <div className="border border-slate-200 rounded p-3">
                  <p className="text-slate-500 text-sm mb-1">Reliability</p>
                  <p className="text-slate-900 text-xl">{result.reliabilityLevel}</p>
                </div>
              </div>
              <p className="text-slate-700 text-sm">{result.overallMessage}</p>
            </div>

            {/* Dataset Information */}
            <div>
              <h2 className="text-slate-900 mb-3">Dataset Information</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Rows:</span>{' '}
                  <span className="text-slate-900">{result.dataset.rows.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">Columns:</span>{' '}
                  <span className="text-slate-900">{result.dataset.columns}</span>
                </div>
                <div>
                  <span className="text-slate-500">Mean:</span>{' '}
                  <span className="text-slate-900">{result.dataset.mean.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">Median:</span>{' '}
                  <span className="text-slate-900">{result.dataset.median.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Detected Biases */}
            <div>
              <h2 className="text-slate-900 mb-3">Detected Biases</h2>
              <div className="space-y-3">
                {result.detectedBiases.map((bias) => (
                  <div key={bias.id} className="border border-slate-200 rounded p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-slate-900">{bias.bias_type}</h3>
                      <span className={`text-sm ${getSeverityColor(bias.severity)}`}>
                        {bias.severity}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm mb-2">Column: {bias.column}</p>
                    <p className="text-slate-700 text-sm">{bias.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h2 className="text-slate-900 mb-3">Recommendations</h2>
              <ul className="space-y-2">
                {result.assessment.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-slate-700 text-sm flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conclusion */}
            <div>
              <h2 className="text-slate-900 mb-3">Conclusion</h2>
              <p className="text-slate-700 text-sm">{result.assessment.conclusion}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button onClick={handleDownload} className="flex-1">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
