import { useState } from 'react';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Header } from './Header';
import { StatCard } from './StatCard';
import { BiasCard } from './BiasCard';
import { SidePanel } from './SidePanel';
import { DistributionChart } from './charts/DistributionChart';
import { BiasFrequencyChart } from './charts/BiasFrequencyChart';
import { BiasHeatmap } from './charts/BiasHeatmap';
import { BiasDensityChart } from './charts/BiasDensityChart';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import type { AnalysisResult } from '../App';

interface DashboardProps {
  result: AnalysisResult;
  onBackToUpload: () => void;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory: AnalysisResult[];
  onViewHistory: (result: AnalysisResult) => void;
}

export function Dashboard({
  result,
  onBackToUpload,
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory,
  onViewHistory,
}: DashboardProps) {
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [selectedHistoryResult, setSelectedHistoryResult] = useState<AnalysisResult | null>(null);
  const [showHistoryPreview, setShowHistoryPreview] = useState(false);

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

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'Moderate':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'High':
        return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'Critical':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        userHistory={userHistory}
        onViewHistory={onViewHistory}
      />

      <div className="bg-slate-100 border-b border-slate-200 py-4">
        <div className="container mx-auto px-4">
          <Button variant="ghost" onClick={onBackToUpload}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Upload
          </Button>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Core Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Status"
                value={result.status === 'complete' ? 'Analysis Complete' : 'Analysis Failed'}
                variant={result.status === 'complete' ? 'success' : 'error'}
              />
                <StatCard
                title="Fairness Score"
                value={result.fairnessScore}
                max={100}
                showProgress
                  showDonut
                />
              <StatCard
                title="Fairness Label"
                value={result.fairnessLabel}
                className={getFairnessColor(result.fairnessLabel)}
              />
              <StatCard
                title="Bias Risk"
                value={result.biasRisk}
                className={getRiskColor(result.biasRisk)}
              />
            </div>

            {/* Dataset Information */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
              <h2 className="text-slate-900 mb-4">Dataset Information</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-500 text-sm mb-1">Dataset Name</p>
                  <p className="text-slate-900">{result.datasetName}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Rows</p>
                  <p className="text-slate-900">{result.dataset.rows.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Columns</p>
                  <p className="text-slate-900">{result.dataset.columns}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Mean</p>
                  <p className="text-slate-900">{result.dataset.mean.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Median</p>
                  <p className="text-slate-900">{result.dataset.median.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Mode</p>
                  <p className="text-slate-900">{result.dataset.mode.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Max Value</p>
                  <p className="text-slate-900">{result.dataset.max.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Min Value</p>
                  <p className="text-slate-900">{result.dataset.min.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Std Dev</p>
                  <p className="text-slate-900">{result.dataset.stdDev.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Variance</p>
                  <p className="text-slate-900">{result.dataset.variance.toLocaleString()}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500 text-sm mb-1">Reliability Level</p>
                  <p className={`inline-block px-3 py-1 rounded-full border text-sm ${getRiskColor(result.reliabilityLevel)}`}>
                    {result.reliabilityLevel}
                  </p>
                </div>
              </div>
            </div>

            {/* Overall Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
              <h3 className="text-blue-900 mb-2">Overall Assessment</h3>
              <p className="text-blue-800">{result.overallMessage}</p>
            </div>

            {/* Visualizations */}
            <div className="mb-8">
              <h2 className="text-slate-900 mb-4">Data Distribution</h2>
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <DistributionChart data={result.distributions} />
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-slate-900 mb-6">Data Bias Plots</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="text-slate-900 mb-4">Bias Frequency</h3>
                  <BiasFrequencyChart biases={result.detectedBiases} />
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="text-slate-900 mb-4">Bias Heatmap</h3>
                  <BiasHeatmap biases={result.detectedBiases} />
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-6 lg:col-span-2">
                  <h3 className="text-slate-900 mb-4">Bias Density</h3>
                  <BiasDensityChart biases={result.detectedBiases} />
                </div>
              </div>
            </div>

            {/* Detected Bias Summary */}
            <div className="mb-8">
              <h2 className="text-slate-900 mb-4">Detected Bias Summary</h2>
              <div className="space-y-4">
                {result.detectedBiases.map((bias) => (
                  <BiasCard key={bias.id} bias={bias} />
                ))}
              </div>
            </div>
          </div>

            {/* Right Column: SidePanel */}
            <div className="w-80 flex-shrink-0 hidden lg:block">
              <div className="sticky top-24">
                <SidePanel assessment={result.assessment} fairnessLabel={result.fairnessLabel} />
              </div>
            </div>
          </div>
      </main>

      {/* Sticky Generate PDF Button */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <Button onClick={() => setShowPDFPreview(true)} size="lg" className="w-full md:w-auto">
            <FileText className="w-4 h-4 mr-2" />
            Generate PDF Report
          </Button>
        </div>
      </div>

      {/* PDF Preview Dialog */}
      <PDFPreviewDialog
        isOpen={showPDFPreview}
        onClose={() => setShowPDFPreview(false)}
        result={result}
      />

      {/* History item PDF Preview Dialog */}
      <PDFPreviewDialog
        isOpen={showHistoryPreview}
        onClose={() => setShowHistoryPreview(false)}
        result={selectedHistoryResult ?? result}
      />
    </div>
  );
}