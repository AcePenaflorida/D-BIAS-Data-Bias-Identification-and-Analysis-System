import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { AnalysisResult } from '../App';
import { persistAnalysisResult } from '../services/db';
import { buildPreviewHtml, openPrintWindowWithHtml } from '../services/reportPdf';
import { toast } from 'sonner';
import ReportPreviewContent from './ReportPreviewContent';

interface PDFPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: AnalysisResult;
}

export function PDFPreviewDialog({ isOpen, onClose, result }: PDFPreviewDialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);

  const printReport = () => {
    if (!contentRef.current) return;
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button').forEach((b) => b.remove());
    const sections = Array.from(clone.querySelectorAll('section'));
    let prev = '';
    sections.forEach((sec, idx) => {
      const headingLower = (sec.querySelector('h2')?.textContent || '').trim().toLowerCase();
      if (idx > 0) {
        const isRecommendations = headingLower === 'recommendations';
        const isRecToConclusion = prev === 'recommendations' && headingLower === 'conclusion';
        const isVisualizations = sec.classList.contains('visualizations-section');
        if (!isRecommendations && !isRecToConclusion && !isVisualizations) {
          sec.classList.add('page-break');
          if ((sec.textContent || '').length < 200) sec.classList.remove('page-break');
        }
      }
      prev = headingLower;
    });
    const html = buildPreviewHtml(result, clone.innerHTML);
    openPrintWindowWithHtml(html);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>PDF Report Preview</DialogTitle>
        </DialogHeader>

        <div ref={contentRef} data-pdf-preview-root className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-white p-8">
          <ReportPreviewContent result={result} />
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button
            onClick={async () => {
              setSaving(true);
              try {
                await persistAnalysisResult(result, result.datasetName);
                toast.success('Saved JSON and PDF to Supabase');
              } catch (e: any) {
                toast.error('Save failed: ' + (e?.message || 'Unknown error'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save to Supabase'}
          </Button>
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
