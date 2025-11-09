import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, AlertCircle, Brain } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Header } from './Header';
import { HomeHistory } from './HomeHistory';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import { Footer } from './Footer';
import type { AnalysisResult } from '../App';
// TODO: create services/api.ts to provide analyzeDataset; temporary inline fallback below.
// import { analyzeDataset } from '../services/api';

interface UploadPageProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory: AnalysisResult[];
  onViewHistory: (result: AnalysisResult) => void;
}

import { analyzeDataset } from '../services/api';
import { Switch } from './ui/switch';

export function UploadPage({
  onAnalysisComplete,
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory,
  onViewHistory,
}: UploadPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [enableAI, setEnableAI] = useState(false);

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

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    setError('');
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      // Generate real preview for CSV (XLSX preview skipped)
      generatePreview(selectedFile);
    }
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

    setIsAnalyzing(true);
    setError('');

    try {
  const result = await analyzeDataset(file, { runGemini: enableAI, returnPlots: 'json' });
      onAnalysisComplete(result);
    } catch (e: any) {
      const msg = String(e?.message || 'Analysis failed.');
      setError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [showHistoryPreview, setShowHistoryPreview] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);


  return (
    <div className="min-h-screen flex flex-col">
      <Header
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        userHistory={userHistory}
        onViewHistory={onViewHistory}
      />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex gap-8">
          {/* Left: Recent history sidebar (visible on large screens) */}
          {isAuthenticated && (
            <aside className="w-72 hidden lg:block">
              {/* Constrain the sticky history column to the viewport so its internal list can scroll */}
              <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <HomeHistory
                  history={userHistory}
                  onPreview={(r) => {
                    setSelectedHistory(r);
                    setShowHistoryPreview(true);
                  }}
                  onOpen={(r) => onViewHistory(r)}
                />
              </div>
            </aside>
          )}

          {/* Main content (uploader + preview) centered */}
          <div className="flex-1 max-w-4xl mx-auto">
            {/* Welcome Message */}
            <div className="text-center mb-12">
              <h1 className="text-slate-900 mb-3">D-BIAS</h1>
              <p className="text-slate-600 text-lg">Your data bias detection companion</p>
            </div>

            {/* Upload Area */}
            <Card className="p-8 mb-6">
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

              {file && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700">
                    <span className="text-slate-500">Selected file:</span> {file.name}
                  </p>
                </div>
              )}
            </Card>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Dataset Preview */}
            {preview.length > 0 && (
              <Card className="p-6 mb-6">
                <h3 className="text-slate-900 mb-4">Dataset Preview</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {preview[0].map((header, idx) => (
                          <th key={idx} className="text-left p-2 text-slate-700">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-slate-100">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="p-2 text-slate-600">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* AI Toggle + Analyze Button */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                <Brain className={`w-4 h-4 ${enableAI ? 'text-purple-600' : 'text-slate-400'}`} />
                <span className="text-sm text-slate-700">Enable AI Explanations</span>
                <Switch checked={enableAI} onCheckedChange={(v) => setEnableAI(!!v)} />
              </div>
              <Button onClick={handleAnalyze} disabled={!file || isAnalyzing} size="lg" className="px-8 w-full md:w-auto">
                {isAnalyzing ? (enableAI ? 'Analyzing + AI…' : 'Analyzing Dataset…') : 'Analyze / Detect Bias'}
              </Button>
              {enableAI && (
                <p className="text-xs text-slate-500 max-w-md text-center">
                  Requires GEMINI_API_KEY in backend environment. If absent, AI explanations will be empty.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* History preview dialog for home */}
      {selectedHistory && (
        <PDFPreviewDialog isOpen={showHistoryPreview} onClose={() => setShowHistoryPreview(false)} result={selectedHistory} />
      )}
    </div>
  );
}
