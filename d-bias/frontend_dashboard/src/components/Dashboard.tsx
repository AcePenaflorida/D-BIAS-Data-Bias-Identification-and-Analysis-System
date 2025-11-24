import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Code } from 'lucide-react';
import { PlotlyFigure } from './charts/PlotlyFigure';
import { Button } from './ui/button';
import { Header } from './Header';
import { StatCard } from './StatCard';
import { BiasCard } from './BiasCard';
import { ExtendedBiasCard } from './ExtendedBiasCard';
import { BiasCorrelationTable } from './BiasCorrelationTable';
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
  const [showRawBias, setShowRawBias] = useState(false);

  // Ensure the dashboard view starts at the top of the page when opened.
  // This prevents the UI from appearing scrolled to the middle if the
  // previous view had a different scroll position.
  useEffect(() => {
    // Use immediate jump to top to avoid an animated reposition on mount.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

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

  const getRiskColor = (level: string) => {
    const key = (level || '').toLowerCase();
    switch (key) {
      case 'low':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'moderate':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'high':
        // For risk summary, high should be red
        return 'text-red-700 bg-red-50 border-red-200';
      case 'critical':
        return 'text-red-800 bg-red-100 border-red-300';
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

      {/* Navigation bar below header */}
      <nav className="w-full bg-transparent px-4 py-1 mb-1">
        <div className="container mx-auto flex items-center justify-between mt-3">
          {/* Back to Upload button on left */}
          <Button
            variant="ghost"
            onClick={onBackToUpload}
            size="sm"
            className="flex items-center gap-1 px-2 py-1 rounded-md font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
            style={{ minWidth: 'fit-content' }}
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            {/* <span className="text-sm">Back to Upload</span> */}
          </Button>
          {/* View PDF Report button removed from nav, now inside Analysis Status card */}
        </div>
      </nav>

      <main className="flex-1 container mx-auto px-4 py-4">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Core Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-14 pb-6">
              <StatCard
                title="Analysis Status"
                value={result.status === 'complete' ? 'Complete' : 'Failed'}
                subtitle={result.status === 'complete' ? 'Dataset analysis completed successfully' : 'Dataset analysis failed'}
                variant={result.status === 'complete' ? 'success' : 'error'}
                inlineBadge={true}
                inlineBadgePosition="value"
                className="bg-white border-slate-200"
              >
                <div className="mt-1 flex justify-end">
                  <Button
                    onClick={() => setShowPDFPreview(true)}
                    size="sm"
                    className="flex items-center gap-1 px-3 py-1 rounded-lg font-medium text-white transition-colors"
                    style={{ backgroundColor: '#155dfc', boxShadow: '0 2px 8px rgba(21,93,252,0.10)', minWidth: 'fit-content' }}
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    <span className="text-sm">View PDF Report</span>
                  </Button>
                </div>
              </StatCard>
                <StatCard
                title="Fairness Score"
                value={result.fairnessScore}
                max={100}
                showProgress
                  showDonut
                titleAddon={
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs leading-none ${getFairnessColor(result.fairnessLabel)}`}>
                    {result.fairnessLabel}
                  </span>
                }
                  valueClassName="text-xl"
                  />
              <StatCard
                title="Bias Risk Summary"
                titleAddon={
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs leading-none ${getRiskColor(result.biasRisk)}`}>
                    {result.biasRisk}
                  </span>
                }
                value={
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 bg-red-50 border-red-200">
                      <p className="text-red-600 text-xs font-medium uppercase mb-2">High</p>
                      <p className="text-2xl font-semibold text-red-600">{result.severitySummary?.High ?? 0}</p>
                    </div>

                    <div className="rounded-lg border p-4 bg-yellow-50 border-yellow-200">
                      <p className="text-yellow-600 text-xs font-medium uppercase mb-2">Moderate</p>
                      <p className="text-2xl font-semibold text-yellow-700">{result.severitySummary?.Moderate ?? 0}</p>
                    </div>

                    <div className="rounded-lg border p-4 bg-green-50 border-green-200">
                      <p className="text-green-600 text-xs font-medium uppercase mb-2">Low</p>
                      <p className="text-2xl font-semibold text-green-700">{result.severitySummary?.Low ?? 0}</p>
                    </div>

                    <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
                      <p className="text-blue-600 text-xs font-medium uppercase mb-2">Total</p>
                      <p className="text-2xl font-semibold text-blue-700">{typeof (result as any).totalBiases === 'number' ? (result as any).totalBiases : result.detectedBiases.length}</p>
                    </div>
                  </div>
                }
                className={`bg-white border-slate-200 lg:col-span-2`}
              />
            </div>

            {/* Dataset Information */}
            {/* Dataset Information section removed, now inside Analysis Status card */}

            {/* Plotly Visualizations from backend (fallback to legacy charts if missing) */}
            <div className="mb-12 space-y-10">
              <div className="bg-white rounded-lg border border-slate-200 p-8 mb-8">
                {result.plots?.fig1?.plotly ? (
                  <PlotlyFigure figure={result.plots.fig1} title="Bias Overview" />
                ) : (
                  <>
                    <h2 className="text-slate-900 mb-4">Data Distribution (Fallback)</h2>
                    <DistributionChart data={result.distributions} />
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  {result.plots?.fig2?.plotly ? (
                    <PlotlyFigure figure={result.plots.fig2} title="Bias Correlations" />
                  ) : (
                    <>
                      <h3 className="text-slate-900 mb-4">Bias Frequency (Fallback)</h3>
                      <BiasFrequencyChart biases={result.detectedBiases} />
                    </>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  {result.plots?.fig3?.plotly ? (
                    <PlotlyFigure figure={result.plots.fig3} title="Bias Severity Distribution" />
                  ) : (
                    <>
                      <h3 className="text-slate-900 mb-4">Bias Heatmap (Fallback)</h3>
                      <BiasHeatmap biases={result.detectedBiases} />
                    </>
                  )}
                </div>
              </div>
              {/* Always include a density fallback visualization */}
              {!result.plots?.fig3?.plotly && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="text-slate-900 mb-4">Bias Density (Fallback)</h3>
                  <BiasDensityChart biases={result.detectedBiases} />
                </div>
              )}
              {result.plots?.error && (
                <div className="text-sm text-red-600">Plot generation error: {result.plots.error}</div>
              )}
            </div>

            {/* Structured Bias Results */}
            <div className="mb-12">
              {/* Outer container for Detected Biases (header + results) */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h2 className="text-slate-900 mb-4">Detected Biases</h2>

                {/* Inner area containing correlation table and the biases results div */}
                <div className="space-y-6">
                  {/* Correlation / identical feature table
                  <BiasCorrelationTable biases={result.detectedBiases} /> */}

                  {/* Bias results list */}
                  <div className="space-y-6">
                    {result.detectedBiases.map((bias) => {
                      // Use extended card when AI explanation contains structured tokens
                      const ai = bias.ai_explanation || '';
                      const hasStructured = /(Meaning|Harm|Impact|Fix)\s*:/i.test(ai);
                      return hasStructured ? (
                        <ExtendedBiasCard key={bias.id} bias={bias} />
                      ) : (
                        <BiasCard key={bias.id} bias={bias} />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Raw Bias JSON Debug Toggle */}
            {result.rawBiasReport && result.rawBiasReport.length > 0 && (
              <div className="mb-12">
                <button
                  onClick={() => setShowRawBias(!showRawBias)}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                >
                  <Code className="w-3 h-3" />
                  {showRawBias ? 'Hide Raw Bias JSON' : 'Show Raw Bias JSON'}
                </button>
                {showRawBias && (
                  <pre className="mt-3 p-4 text-xs bg-slate-900 text-slate-100 rounded-lg overflow-auto max-h-96">
{JSON.stringify(result.rawBiasReport, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

            {/* Right Column: SidePanel */}
            <div className="w-80 flex-shrink-0 hidden lg:block">
              <div className="sticky top-24">
                <SidePanel assessment={result.assessment} fairnessLabel={result.fairnessLabel} />
              </div>
            </div>
          </div>
      </main>


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