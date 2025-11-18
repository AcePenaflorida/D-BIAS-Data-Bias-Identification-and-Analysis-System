import type { AnalysisResult } from '../App';
import Logo from '../assets/logo_ver2.png';

type Props = { result: AnalysisResult };

function formatInline(segment: string) {
  return segment.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'Low': return 'text-green-700';
    case 'Moderate': return 'text-yellow-700';
    case 'High': return 'text-orange-700';
    case 'Critical': return 'text-red-700';
    default: return 'text-slate-700';
  }
}

function RenderAIExplanation({ text }: { text: string }) {
  const lines = (text || '').split(/\r?\n/);
  const elements: JSX.Element[] = [];
  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length) {
      elements.push(
        <ul className="list-disc pl-5 space-y-1" key={elements.length + '-list'}>
          {listBuffer.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item.trim()) }} />
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushList(); return; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2));
    } else {
      flushList();
      elements.push(
        <p className="text-slate-700 text-sm" key={elements.length + '-p'} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
      );
    }
  });
  flushList();
  return <div className="space-y-2 mt-3">{elements}</div>;
}

export function ReportPreviewContent({ result }: Props) {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center border-b border-slate-200 pb-6">
        <h1 className="mb-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center justify-center h-8 w-8">
            <img src={Logo} alt="D-BIAS" className="h-8 w-8 object-contain" />
          </span>
          <span className="text-slate-900 text-xl"><span className="font-semibold">D-BIAS</span> <span className="font-normal">Analysis Report</span></span>
        </h1>
        <p className="text-slate-600 text-sm font-medium">{result.datasetName}</p>
        <p className="text-slate-500 text-xs mt-1">Generated on {new Date(result.uploadDate).toLocaleDateString()}</p>
      </div>

      {/* Executive Summary */}
      <section>
        <h2 className="text-slate-900 mb-4 text-lg">Executive Summary</h2>
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div className="border border-slate-200 rounded p-3">
            <p className="text-slate-500 text-xs mb-1">Fairness Score</p>
            <p className="text-slate-900 text-xl font-semibold">{result.fairnessScore}/100</p>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <p className="text-slate-500 text-xs mb-1">Bias Risk</p>
            <p className="text-slate-900 text-xl font-semibold">{result.biasRisk}</p>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <p className="text-slate-500 text-xs mb-1">Fairness Label</p>
            <p className="text-slate-900 text-xl font-semibold">{result.fairnessLabel}</p>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <p className="text-slate-500 text-xs mb-1">Reliability</p>
            <p className="text-slate-900 text-xl font-semibold">{result.reliabilityLevel}</p>
          </div>
        </div>
      </section>

      {/* Dataset Information */}
      <section>
        <h2 className="text-slate-900 mb-4 text-lg">Dataset Information</h2>
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
      </section>

      {/* Plots */}
      {result.plots && (
        <section className="visualizations-section">
          <h2 className="text-slate-900 mb-4 text-lg">Visualizations</h2>
          <div className="visualizations-layout">
            {result.plots.fig1?.png_base64 && (
              <figure className="viz-wide border border-slate-200 rounded p-4 bg-slate-50">
                <img src={`data:image/png;base64,${result.plots.fig1.png_base64}`} alt="Bias Distribution Overview" className="w-full h-auto object-contain" />
                <figcaption className="mt-2 text-center text-xs text-slate-600">Bias Distribution Overview</figcaption>
              </figure>
            )}
            <div className="visualizations-row">
              {result.plots.fig2?.png_base64 && (
                <figure className="border border-slate-200 rounded p-4 bg-slate-50">
                  <img src={`data:image/png;base64,${result.plots.fig2.png_base64}`} alt="Feature Correlation & Fairness Indicators" className="w-full h-auto object-contain" />
                  <figcaption className="mt-2 text-center text-xs text-slate-600">Feature Correlation & Fairness Indicators</figcaption>
                </figure>
              )}
              {result.plots.fig3?.png_base64 && (
                <figure className="border border-slate-200 rounded p-4 bg-slate-50">
                  <img src={`data:image/png;base64,${result.plots.fig3.png_base64}`} alt="Severity Heatmap Across Attributes" className="w-full h-auto object-contain" />
                  <figcaption className="mt-2 text-center text-xs text-slate-600">Severity Heatmap Across Attributes</figcaption>
                </figure>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Detected Biases */}
      <section>
        <h2 className="text-slate-900 mb-4 text-lg">Detected Biases</h2>
        <div className="space-y-5">
          {result.detectedBiases.map((bias) => (
            <article key={bias.id} className="bias-card border border-slate-200 rounded-lg p-5 shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <h3 className="text-slate-900 font-semibold text-base">{bias.bias_type}</h3>
                <span className={`text-xs font-medium px-2 py-1 rounded-full bg-slate-100 ${getSeverityColor(bias.severity)}`}>{bias.severity}</span>
              </header>
              <p className="text-slate-600 text-xs mb-2">Column: <span className="font-mono text-slate-700">{bias.column}</span></p>
              <p className="text-slate-700 text-sm mb-3"><strong>Description:</strong> {bias.description}</p>
              <div>
                <p className="text-slate-800 text-sm font-semibold mb-1">AI Explanation</p>
                <RenderAIExplanation text={bias.ai_explanation} />
              </div>
              {bias.definition && (
                <p className="text-slate-500 text-xs mt-3"><strong>Definition:</strong> {bias.definition}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Recommendations */}
      <section>
        <h2 className="text-slate-900 mb-4 text-lg">Recommendations</h2>
        <ul className="space-y-2">
          {result.assessment.recommendations.map((rec, idx) => (
            <li key={idx} className="text-slate-700 text-sm flex items-start gap-2">
              <span className="text-blue-600 font-semibold">•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInline(rec) }} />
            </li>
          ))}
        </ul>
      </section>

      {/* Conclusion */}
      <section>
        <h2 className="text-slate-900 mb-4 text-lg">Conclusion</h2>
        <p className="text-slate-700 text-sm" dangerouslySetInnerHTML={{ __html: formatInline(result.assessment.conclusion) }} />
      </section>
    </div>
  );
}

export default ReportPreviewContent;
