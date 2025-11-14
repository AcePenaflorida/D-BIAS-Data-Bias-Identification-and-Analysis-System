import { useRef } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { AnalysisResult } from '../App';
// Removed image import; using inline SVG for crisp print output

interface PDFPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: AnalysisResult;
}

export function PDFPreviewDialog({ isOpen, onClose, result }: PDFPreviewDialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Shared inline markdown formatter (currently only **bold**)
  const formatInline = (segment: string) => segment.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');


  const printReport = () => {
    if (!contentRef.current) return;
    const reportNode = contentRef.current.cloneNode(true) as HTMLElement;

    // Remove interactive controls inside clone (buttons inside footer etc.)
    reportNode.querySelectorAll('button').forEach(b => b.remove());

    const win = window.open('', '_blank');
    if (!win) return alert('Popup blocked: allow popups to print.');

    // Collect existing style/link tags for Tailwind & component styles
    const styleTags = Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    // Add print-specific styles (custom header/footer + page counters)
    const datasetTitle = result.datasetName;
    const printStyles = `
      <style>
        @page { margin: 16mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-before: always; }
          .print-wrapper { max-width: 100%; width: 100%; margin: 0; padding: 0 28px 28px; box-sizing: border-box; }
          .print-wrapper section + section { margin-top: 20px; }
          .print-wrapper .bias-card + .bias-card { margin-top: 16px; }
          /* Visualizations forced onto a new dedicated page */
          .visualizations-section { page-break-before: always; page-break-inside: avoid; }
          .visualizations-layout { display: block; }
          .visualizations-layout .viz-wide { margin: 0 0 14px; page-break-inside: avoid; }
          .visualizations-row { display: flex; gap: 14px; page-break-inside: avoid; }
          .visualizations-row figure { flex: 1; margin: 0; page-break-inside: avoid; }
          .visualizations-row img { width: 100%; height: auto; max-height: 240px; }
          .viz-wide img { width: 100%; height: auto; max-height: 360px; }
          .visualizations-section figcaption { font-size: 11px; }
        }
        * { -webkit-print-color-adjust: exact; }
        .print-wrapper strong { font-weight: 600; }
      </style>`;

    // Insert artificial page breaks between major sections, but skip before Recommendations and between Recommendations -> Conclusion
    const sectionEls = Array.from(reportNode.querySelectorAll('section'));
    let prevHeadingLower = '';
    sectionEls.forEach((sec, idx) => {
      const headingLower = (sec.querySelector('h2')?.textContent || '').trim().toLowerCase();
      if (idx > 0) {
        const isRecommendations = headingLower === 'recommendations';
        const isRecToConclusion = prevHeadingLower === 'recommendations' && headingLower === 'conclusion';
        const isVisualizations = sec.classList.contains('visualizations-section');
        if (!isRecommendations && !isRecToConclusion && !isVisualizations) {
            sec.classList.add('page-break');
            if ((sec.textContent || '').length < 200) {
              sec.classList.remove('page-break');
            }
        }
      }
      prevHeadingLower = headingLower;
    });

    const html = `<!DOCTYPE html><html><head><title>D-BIAS Bias Analysis Report — ${datasetTitle}</title>${styleTags}${printStyles}</head><body><div class="print-wrapper">${reportNode.innerHTML}</div></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Ensure tab title and address reflect D-BIAS instead of about:blank
    try {
      win.document.title = 'D-BIAS';
      // Update the address bar path (cannot change origin for security)
      if (win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState({}, 'D-BIAS', '/D-BIAS');
      }
    } catch {}
    // Give the new window a moment to layout styles before printing
    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
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

  const renderAIExplanation = (text: string) => {
    // Basic markdown-like parsing: bold **text**, lists -, blank line paragraphs
    const lines = text.split(/\r?\n/);
    const elements: JSX.Element[] = [];
    let listBuffer: string[] = [];
    const flushList = () => {
      if (listBuffer.length) {
        elements.push(
          <ul className="list-disc pl-5 space-y-1" key={elements.length + '-list'}>
            {listBuffer.map((item, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: inlineFormat(item.trim()) }} />
            ))}
          </ul>
        );
        listBuffer = [];
      }
    };

    const inlineFormat = (segment: string) => {
      // Replace **bold**
      return segment.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    };

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        flushList();
        return;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        listBuffer.push(line.slice(2));
      } else {
        flushList();
        elements.push(
          <p className="text-slate-700 text-sm" key={elements.length + '-p'} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
        );
      }
    });
    flushList();
    return <div className="space-y-2 mt-3">{elements}</div>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>PDF Report Preview</DialogTitle>
        </DialogHeader>

        <div ref={contentRef} className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-white p-8">
          {/* PDF Content Preview */}
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Header with inline SVG logo for crisp print */}
            <div className="text-center border-b border-slate-200 pb-6">
              <h1 className="mb-3 flex items-center justify-center gap-2">
                <span className="inline-flex items-center justify-center h-8 w-8">{/* Simplified inline SVG (scaled) */}
                  <svg viewBox="0 0 500 500" className="h-8 w-8" aria-hidden="true">
                    <circle cx="356" cy="92" r="80" fill="#41A3B1" />
                    <circle cx="248" cy="78" r="62" fill="#E5933E" />
                    <circle cx="198" cy="230" r="60" fill="#EB5062" />
                    <circle cx="92" cy="156" r="44" fill="#E5933E" />
                    <rect x="220" y="332" width="120" height="120" transform="rotate(50 280 392)" fill="#84AC48" />
                  </svg>
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
                  {/* Wide top visualization (fig1) */}
                  {result.plots.fig1?.png_base64 && (
                    <figure className="viz-wide border border-slate-200 rounded p-4 bg-slate-50">
                      <img
                        src={`data:image/png;base64,${result.plots.fig1.png_base64}`}
                        alt="Bias Distribution Overview"
                        className="w-full h-auto object-contain"
                      />
                      <figcaption className="mt-2 text-center text-xs text-slate-600">Bias Distribution Overview</figcaption>
                    </figure>
                  )}
                  <div className="visualizations-row">
                    {result.plots.fig2?.png_base64 && (
                      <figure className="border border-slate-200 rounded p-4 bg-slate-50">
                        <img
                          src={`data:image/png;base64,${result.plots.fig2.png_base64}`}
                          alt="Feature Correlation & Fairness Indicators"
                          className="w-full h-auto object-contain"
                        />
                        <figcaption className="mt-2 text-center text-xs text-slate-600">Feature Correlation & Fairness Indicators</figcaption>
                      </figure>
                    )}
                    {result.plots.fig3?.png_base64 && (
                      <figure className="border border-slate-200 rounded p-4 bg-slate-50">
                        <img
                          src={`data:image/png;base64,${result.plots.fig3.png_base64}`}
                          alt="Severity Heatmap Across Attributes"
                          className="w-full h-auto object-contain"
                        />
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
                      {renderAIExplanation(bias.ai_explanation)}
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
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={printReport} className="flex-1">
            Print / Save PDF
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
