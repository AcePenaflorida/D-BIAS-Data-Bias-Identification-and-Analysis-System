import type { AnalysisResult } from '../App';

function collectCurrentStyles(): string {
  const tags = Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]'));
  return tags.map(el => (el as HTMLElement).outerHTML).join('\n');
}

function formatInlineBold(segment: string) {
  return segment.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Build the same HTML used by the PreviewDialog print function for pixel-perfect output
export function buildPreviewHtml(result: AnalysisResult, contentHtml: string): string {
  const styleTags = collectCurrentStyles();
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
  const html = `<!DOCTYPE html><html><head><title>D-BIAS Bias Analysis Report — ${datasetTitle}</title>${styleTags}${printStyles}</head><body><div class="print-wrapper">${contentHtml}</div></body></html>`;
  return html;
}

// Open a print window using identical HTML (PreviewDialog behavior)
export function openPrintWindowWithHtml(html: string) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Popup blocked: allow popups to print.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.document.title = 'D-BIAS';
    if (win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState({}, 'D-BIAS', '/D-BIAS');
    }
  } catch {}
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// Placeholder for a true 1:1 Blob export. Browsers cannot capture print-to-PDF programmatically.
// This returns a Blob of the HTML snapshot so it can optionally be rendered server-side to PDF.
export async function generateFullQualityPDF(result: AnalysisResult, contentElement: HTMLElement): Promise<Blob> {
  const node = contentElement.cloneNode(true) as HTMLElement;
  // Remove interactive controls
  node.querySelectorAll('button').forEach(b => b.remove());
  // Add soft page breaks to match PreviewDialog logic (heuristic)
  const sections = Array.from(node.querySelectorAll('section'));
  let prev = '';
  sections.forEach((sec, idx) => {
    const heading = (sec.querySelector('h2')?.textContent || '').trim().toLowerCase();
    if (idx > 0) {
      const isRecommendations = heading === 'recommendations';
      const isRecToConclusion = prev === 'recommendations' && heading === 'conclusion';
      const isVisualizations = sec.classList.contains('visualizations-section');
      if (!isRecommendations && !isRecToConclusion && !isVisualizations) {
        sec.classList.add('page-break');
        if ((sec.textContent || '').length < 200) sec.classList.remove('page-break');
      }
    }
    prev = heading;
  });
  const html = buildPreviewHtml(result, node.innerHTML);
  // Return HTML snapshot as Blob so backend can convert to PDF if desired
  return new Blob([html], { type: 'text/html' });
}
