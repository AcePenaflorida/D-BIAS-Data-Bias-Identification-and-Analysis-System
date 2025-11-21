import { useState, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, AlertCircle, Loader2, CheckCircle, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Header } from './Header';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import { Footer } from './Footer';
import type { AnalysisResult } from '../App';
import { analyzeDatasetThrottled, uploadDataset, fetchLatestCachedAnalysis, type UploadInfo, cancelAnalysis } from '../services/api';
import { toast } from 'sonner';

interface UploadPageProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory: AnalysisResult[];
  onViewHistory: (result: AnalysisResult) => void;
}
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

export function UploadPage({
  onAnalysisComplete,
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory,
  onViewHistory,
}: UploadPageProps) {
  const [isScrollingToUpload, setIsScrollingToUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null);
  const [uploadInfoError, setUploadInfoError] = useState<string>('');
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [analysisController, setAnalysisController] = useState<AbortController | null>(null);
  const [isLoadingCached, setIsLoadingCached] = useState(false);
  const [hasCached, setHasCached] = useState<boolean | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // Cancel analysis and notify backend
  const handleCancelAnalyze = async () => {
    if (analysisController) {
      analysisController.abort(); // abort frontend request
    }
    setIsCancelling(true);
    try {
      const resp = await cancelAnalysis();
      toast.message(resp.status === 'Canceled' ? 'Analysis canceled.' : 'No active job to cancel.');
      setError(resp.status === 'Canceled' ? 'Analysis canceled.' : 'No active job to cancel.');
    } catch (e: any) {
      toast.error('Failed to cancel analysis.');
      setError('Failed to cancel analysis.');
    } finally {
      setIsCancelling(false);
      setIsAnalyzing(false);
      setAnalysisController(null);
    }
  };

  // Probe cached availability once on mount
  useEffect(() => {
    let mounted = true;
    fetchLatestCachedAnalysis()
      .then((r) => { if (mounted) setHasCached(!!r); })
      .catch(() => { if (mounted) setHasCached(false); });
    return () => { mounted = false; };
  }, []);

  // Reset all dataset-related state (used when closing the preview dialog)
  const resetDatasetSelection = useCallback(() => {
    setFile(null);
    setPreview([]);
    setUploadInfo(null);
    setUploadInfoError('');
    setIsValidating(false);
    setError('');
  }, []);

  // Close logic for preview dialog: always clear dataset selection (valid or invalid) per refined requirements
  const closePreviewDialog = useCallback(() => {
    setShowPreviewDialog(false);
    // Always fully reset so summary shows neutral state
    resetDatasetSelection();
  }, [isAnalyzing, analysisController, resetDatasetSelection]);

  // Safety net: if validation finishes successfully but the modal somehow didn't open,
  // auto-open it when we have uploadInfo and no validation error.
  useEffect(() => {
    if (file && uploadInfo && !uploadInfoError) {
      setShowPreviewDialog(true);
    }
  }, [file, uploadInfo, uploadInfoError]);

  // Debug: track dialog open state changes
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[UploadPage] showPreviewDialog:', showPreviewDialog);
  }, [showPreviewDialog]);

  const validateFile = (file: File): boolean => {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel', // sometimes used for CSV by browsers
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', // some CSVs report as plain text
    ];

    const isCsv = name.endsWith('.csv') || type.includes('csv') || type === 'text/plain';
    const isXlsx = name.endsWith('.xlsx') || type.includes('spreadsheetml');

    if (!isCsv && !isXlsx && !validTypes.includes(type)) {
      setError('Invalid file format. Please upload a CSV or XLSX file.');
      return false;
    }
    return true;
  };

  // Real CSV preview using Papa Parse (first 5 rows)
  const generatePreview = (file: File) => {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const isCsv = name.endsWith('.csv') || type.includes('csv') || type === 'text/plain';

    if (!isCsv) {
      setPreview([]);
      return;
    }

    Papa.parse<string[]>(file, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      preview: 6,
      // Use a Web Worker so large files don't block UI and prevent dialog from appearing promptly
      worker: true,
      complete: (results: Papa.ParseResult<string[]>) => {
        const rows = (results.data as unknown as string[][]) || [];
        if (rows.length > 0) {
          const header = rows[0];
          const isHeader = header.every((h) => typeof h === 'string');
          if (!isHeader) {
            const cols = Math.max(...rows.map((r) => r.length));
            const genHeader = Array.from({ length: cols }, (_, i) => `col_${i + 1}`);
            setPreview([genHeader, ...rows]);
          } else {
            setPreview(rows);
          }
        } else {
          setPreview([]);
        }
      },
      error: () => setPreview([]),
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please upload a file first.');
      return;
    }

    toast.message('Analyzing dataset…');
    setIsAnalyzing(true);
    setError('');
    const controller = new AbortController();
    setAnalysisController(controller);

    try {
      // Request both JSON and PNG plot data so previews and PDFs can embed images
      const result = await analyzeDatasetThrottled(file as File, { runGemini: true, returnPlots: 'both' }, controller.signal);
      // Suppress any post-analysis toasts
      onAnalysisComplete(result);
    } catch (e: any) {
      const name = String(e?.name || '');
      const msg = String(e?.message || '');
      const isAbortLike = name === 'AbortError' || /aborted/i.test(msg);
      if (isAbortLike) {
        setError('Analysis canceled.');
        // Suppress cancel toast
      } else {
        setError(msg || 'Analysis failed.');
        // Suppress error toast
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisController(null);
    }
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    setError('');
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      // Generate real preview for CSV (XLSX preview skipped)
      generatePreview(selectedFile);
      // Kick off backend lightweight validation
      setUploadInfo(null);
      setUploadInfoError('');
      // Start validation without opening the preview yet to avoid flicker for invalid datasets
      setShowPreviewDialog(false);
      setIsValidating(true);
      console.debug('[UploadPage] Validating dataset…');
      uploadDataset(selectedFile)
        .then((info) => {
          console.debug('[UploadPage] Validation success', info);
          setUploadInfo(info);
          setIsValidating(false);
          // Open the preview only after successful validation
          setShowPreviewDialog(true);
        })
        .catch((e: any) => {
          const msg = String(e?.message || 'Validation failed');
          setUploadInfoError(msg);
          console.warn('[UploadPage] Validation failed', msg);
          // Close preview dialog if it was opened and show validation error dialog instead
          setShowPreviewDialog(false);
          setIsValidating(false);
          setUploadInfo(null);
          setShowValidationDialog(true);
        });
    }
  };

  // Load the latest cached analysis from backend and open dashboard (if exists)
  const handleLoadCached = async () => {
    setError('');
    setIsLoadingCached(true);
    try {
      const result = await fetchLatestCachedAnalysis();
      if (!result) {
        setError('No cached analysis available yet. Upload and analyze a dataset first.');
        setHasCached(false);
      } else {
        onAnalysisComplete(result);
      }
    } finally {
      setIsLoadingCached(false);
    }
  };

  // Scroll the upload card into the vertical center of the viewport.
  // Uses a smooth scroll and clamps the target to the document bounds.
  const scrollUploadCardToCenter = useCallback(() => {
    const el = document.getElementById('upload-section');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const elTopInPage = window.scrollY + rect.top;
    const elCenter = elTopInPage + rect.height / 2;
    const target = elCenter - window.innerHeight / 2;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const final = Math.min(Math.max(0, target), maxScroll);

    setIsScrollingToUpload(true);
    window.scrollTo({ top: final, behavior: 'smooth' });
    // Clear the pressed animation after an estimated scroll duration.
    window.setTimeout(() => setIsScrollingToUpload(false), 800);
  }, []);

  const [showHistoryPreview, setShowHistoryPreview] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);


  return (
    <div className="min-h-screen flex flex-col">
      {/* Header removed for user page as requested */}

      <Header
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        userHistory={userHistory}
        onViewHistory={onViewHistory}
      />

      {/* Sidebar is rendered by App (layout flow) */}

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex gap-8">

          {/* Main content (uploader + preview) centered */}
          <div className="flex-1 max-w-4xl mx-auto">
            {/* Hero / Welcome — replaced with larger styled headline per design */}
            <div className="text-center mb-12">
              <h1 className="font-extrabold leading-tight">
                <span
                  className="text-slate-900 block leading-tight"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 6.5rem)', fontWeight: 800 }}
                >
                  D-BIAS,
                </span>
                <span
                  className="text-blue-600 block leading-tight"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 6.5rem)', fontWeight: 800 }}
                >
                  {' '} your data bias detection companion
                </span>
              </h1>
              <p className="mt-6 text-slate-600 text-base md:text-lg max-w-3xl mx-auto">
                Detect and analyze bias in your datasets with advanced statistical methods.
                <br />
                Make data-driven decisions with confidence.
              </p>
              <div className="mt-6">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    scrollUploadCardToCenter();
                  }}
                  className={`group text-blue-600 text-sm inline-flex items-center gap-2 px-3 py-1 rounded-md transition-transform duration-300 ease-out hover:scale-105 active:scale-95 ${isScrollingToUpload ? 'scale-95 opacity-80' : ''}`}
                >
                  <span>Scroll down to upload your first dataset</span>
                  <span aria-hidden className="ml-1 transition-transform duration-300 transform group-hover:translate-x-1">
                    {/* SVG arrow with glowing drop-shadow and subtle pulse */}
                    <svg
                      className="w-5 h-5 text-blue-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.55))' }}
                      aria-hidden
                    >
                      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            {/* Upload Area */}
            {/* Dataset preview placeholder (UI-only) */}
            <Card className="p-8 mb-6">
              <div className="w-full rounded-xl overflow-hidden border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
                <div className="h-56 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-blue-300" />
                    </div>
                    <p className="text-slate-600">Dataset visualization area</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-8 mb-6" id="upload-section">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-slate-700 mb-2">Drag and drop your dataset here, or</p>
                    <label htmlFor="file-upload">
                      <Button variant="outline" asChild>
                        <span className="cursor-pointer">
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Choose File
                        </span>
                      </Button>
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </div>
                  <p className="text-slate-500 text-sm">Supported formats: CSV, XLSX (first sheet only)</p>
                </div>
              </div>

              <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                {file ? (
                  <>
                    <p className="text-slate-700">
                      <span className="text-slate-500">Selected file:</span> {file.name}
                    </p>
                    {/* Show only validating status; suppress rows/columns/columns list per refined requirements */}
                    {!uploadInfoError && isValidating && (
                      <p className="mt-2 text-xs text-slate-500">Validating dataset…</p>
                    )}
                    {/* Success UI: show a green validated badge when backend validation succeeded */}
                    {uploadInfo && !uploadInfoError && !isValidating && (
                      <div className="mt-3">
                        <div
                          role="status"
                          aria-live="polite"
                          className="inline-flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2"
                        >
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <CheckCircle className="h-4 w-4" />
                          </span>
                          <span className="text-sm text-green-800 font-medium">{file.name} validated successfully</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-slate-500 text-sm">No file selected.</p>
                    <Button
                      onClick={handleLoadCached}
                      disabled={isLoadingCached || hasCached === false}
                      variant="secondary"
                    >
                      {isLoadingCached
                        ? 'Loading cached…'
                        : hasCached === false
                          ? 'No Cache Yet'
                          : 'Load Cached Analysis'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="mb-6 animate-fade-in">
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 stroke-2 text-red-500" />
                  <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-medium text-xs">Error</span>
                </span>
                <AlertDescription className="animate-fade-in text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Dataset Preview now shown in a modal dialog */}

            {/* Page-level Analyze button removed; only available inside preview dialog */}
          </div>
        </div>
      </main>

      <Footer />

      {/* History preview dialog for home */}
      {selectedHistory && (
        <PDFPreviewDialog isOpen={showHistoryPreview} onClose={() => setShowHistoryPreview(false)} result={selectedHistory} />
      )}

      {/* Validation Error Dialog */}
      <Dialog
        open={showValidationDialog}
        onOpenChange={(open) => {
          setShowValidationDialog(open);
          if (!open && uploadInfoError) {
            resetDatasetSelection();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </span>
                <span className="text-red-700">Dataset Validation Failed</span>
              </div>
            </DialogTitle>
            <DialogDescription>
              <span className="block rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Please fix the following issues before running analysis:
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3">
            <ul className="space-y-3">
              {extractReasons(uploadInfoError).map((r, idx) => (
                <li key={idx} className="flex items-start gap-3 animate-fade-in">
                  <span className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-400"></span>
                  <span className="text-sm text-slate-800">{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium text-xs">
              <Info className="h-4 w-4 stroke-2" />
              Tip: Ensure ≥ 20 rows, ≥ 3 columns, include at least one categorical/text feature, and reduce duplicate rows.
            </span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowValidationDialog(false);
                // Explicitly reset upon closing so summary shows neutral state
                resetDatasetSelection();
              }}
              className="transition-all duration-300 ease-in-out hover:bg-blue-50 hover:scale-[1.04] focus:ring-2 focus:ring-blue-400 active:scale-[0.98]"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setShowValidationDialog(false);
                resetDatasetSelection();
                document.getElementById('file-upload')?.click();
              }}
              className="transition-all duration-300 ease-in-out hover:bg-blue-50 hover:scale-[1.04] focus:ring-2 focus:ring-blue-400 active:scale-[0.98]"
            >
              Choose Another File
            </Button>
          </div>
        </DialogContent>
              <style>{`
                @keyframes fade-in {
                  from { opacity: 0; transform: translateY(12px); }
                  to { opacity: 1; transform: none; }
                }
                .animate-fade-in {
                  animation: fade-in 0.5s cubic-bezier(.4,0,.2,1) both;
                }
                @media (max-width: 640px) {
                  .DialogContent {
                    min-width: 100vw !important;
                    max-width: 100vw !important;
                    padding: 0.5rem !important;
                  }
                  .rounded-xl, .rounded-lg {
                    border-radius: 1rem !important;
                  }
                  .flex-col.md\:flex-row {
                    flex-direction: column !important;
                    gap: 1.5rem !important;
                  }
                  .max-w-4xl {
                    max-width: 100vw !important;
                  }
                  .container {
                    padding-left: 0.5rem !important;
                    padding-right: 0.5rem !important;
                  }
                }
              `}</style>
      </Dialog>

      {/* Dataset Preview Dialog */}
      <Dialog
        open={showPreviewDialog}
        onOpenChange={(open) => {
          if (!open) {
            closePreviewDialog();
          } else if (!isAnalyzing) {
            setShowPreviewDialog(true);
          }
        }}
      >
  <DialogContent className="w-[90vw] max-w-[960px] min-w-[340px] max-h-[80vh] rounded-xl overflow-hidden">
          <DialogHeader>
            <div className="flex flex-col md:flex-row items-start justify-between gap-6 md:gap-3 pb-2">
              <div>
                <DialogTitle className="mb-1 text-2xl font-bold text-slate-900">Dataset Preview</DialogTitle>
                <DialogDescription>
                  {uploadInfo ? (
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-base text-slate-700">
                      <span className="font-semibold text-blue-700 flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" /> {file?.name}
                      </span>
                      <span className="font-semibold text-slate-600 flex items-center gap-2">
                        <span className="bg-slate-100 rounded px-2 py-1 text-xs font-medium">Rows: {uploadInfo.rows}</span>
                        <span className="bg-slate-100 rounded px-2 py-1 text-xs font-medium">Columns: {uploadInfo.cols}</span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500">Validating dataset…</span>
                  )}
                </DialogDescription>
              </div>
              <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { if (!isAnalyzing) document.getElementById('file-upload')?.click(); }}
                      className={`shrink-0 transition-all duration-300 ease-in-out ${isAnalyzing ? 'opacity-60 pointer-events-none' : 'hover:bg-[#155dfc] hover:text-white hover:scale-[1.04] hover:shadow-lg focus:ring-2 focus:ring-[#155dfc] active:scale-[0.98]'}`}
                      disabled={isAnalyzing}
                      aria-disabled={isAnalyzing}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" /> Re-upload CSV
                    </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="w-full max-w-full h-[420px] overflow-x-auto overflow-y-auto overscroll-contain bg-gradient-to-br from-white to-slate-50 shadow-sm custom-scrollbar">
              {preview.length > 0 ? (
                <table className="w-max min-w-full text-sm table-auto rounded-lg overflow-hidden shadow border border-slate-100">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      {preview[0].map((header, idx) => (
                        <th
                          key={idx}
                          className={`text-left px-4 py-3 text-slate-800 font-semibold bg-slate-50 border-r border-slate-100 last:border-r-0 ${idx === 0 ? 'sticky left-0 bg-slate-100 z-20' : ''}`}
                          tabIndex={0}
                          aria-label={`Column ${header}`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, rowIdx) => (
                      <tr key={rowIdx} className={`border-b border-slate-100 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/40`}>
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className={`px-4 py-3 text-slate-700 whitespace-nowrap align-top border-r border-slate-50 last:border-r-0 ${cellIdx === 0 ? 'sticky left-0 bg-slate-50 z-10' : ''}`}
                            title={cell}
                            tabIndex={0}
                            aria-label={`Row ${rowIdx + 1} Column ${preview[0][cellIdx]}: ${cell}`}
                          >
                            {cell.length > 32 ? (
                              <span title={cell}>{cell.slice(0, 32)}…</span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-base text-slate-500 flex flex-col items-center justify-center h-full">
                  <svg width="64" height="64" fill="none" viewBox="0 0 64 64" className="mb-4 opacity-60">
                    <rect x="8" y="16" width="48" height="32" rx="6" fill="#e0e7ef" />
                    <rect x="16" y="24" width="32" height="8" rx="2" fill="#b6c2e2" />
                    <rect x="16" y="36" width="20" height="4" rx="2" fill="#cbd5e1" />
                  </svg>
                  Preparing preview…
                </div>
              )}
            </div>
            <style>{`
              .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; background: #f1f5f9; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={isAnalyzing ? handleCancelAnalyze : closePreviewDialog}
                disabled={isCancelling}
              >
                {isAnalyzing ? (isCancelling ? 'Cancelling…' : 'Cancel') : 'Close'}
              </Button>
              {uploadInfo && !uploadInfoError && (
                <Button
                  onClick={handleAnalyze}
                  disabled={!file || isAnalyzing}
                  aria-busy={isAnalyzing}
                  className={`flex items-center gap-2 font-semibold transition-all duration-300 ease-in-out bg-[#155dfc] text-white px-6 py-2 rounded-lg shadow-sm hover:bg-[#0e47c2] hover:scale-[1.04] hover:shadow-lg focus:ring-2 focus:ring-[#155dfc] active:scale-[0.98] ${(!file || isAnalyzing) ? 'opacity-60 pointer-events-none' : ''}`}
                  style={{ backgroundColor: '#155dfc', border: 'none' }}
                >
                  {isAnalyzing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isAnalyzing ? 'Analyzing…' : 'Analyze'}
                </Button>
              )}
            </div>
          </div>

          {/* Removed page overlay; spinner now lives inside the Analyze button for a lighter UX */}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to extract reasons list from aggregated error string
function extractReasons(errMsg: string): string[] {
  if (!errMsg) return [];
  // Expected pattern: "dataset failed minimal sanity checks: reason1; reason2; reason3"
  const idx = errMsg.indexOf(':');
  const tail = idx >= 0 ? errMsg.slice(idx + 1) : errMsg;
  return tail
    .split(/;|\n|\r/)
    .map((s) => s.trim())
    .filter(Boolean);
}
