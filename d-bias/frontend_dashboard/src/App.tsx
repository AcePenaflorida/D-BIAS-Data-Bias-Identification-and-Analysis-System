import { useEffect, useState } from 'react';
import { UploadPage } from './components/UploadPage';
import { Dashboard } from './components/Dashboard';
// ToggleMenu (sidebar) removed — header now shows history/profile/logout
import { Toaster } from './components/ui/sonner';
import { getSession, onAuthStateChange, signOut } from './services/auth';
import { ensureUserProfile, loadSavedAnalyses, saveAnalysis as saveAnalysisRow } from './services/db';
import { uploadFile } from './services/storage';
import Logo from './assets/logo_ver2.png';
import { generateFullQualityPDF } from './services/reportPdf';
import { toast } from 'sonner';
import ReportPreviewContent from './components/ReportPreviewContent';
import { supabase } from './lib/supabase';
import React from "react";

export interface AnalysisResult {
  id: string;
  datasetName: string;
  uploadDate: string;
  status: 'complete' | 'failed';
  dataset: {
    rows: number;
    columns: number;
    mean: number;
    median: number;
    mode: number;
    max: number;
    min: number;
    stdDev: number;
    variance: number;
  };
  fairnessScore: number;
  fairnessLabel: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  biasRisk: 'Low' | 'Moderate' | 'High' | 'Critical';
  reliabilityLevel: 'High' | 'Moderate' | 'Low';
  reliabilityMessage?: string;
  overallMessage: string;
  totalBiases?: number;
  severitySummary?: {
    High?: number;
    Moderate?: number;
    Low?: number;
    Critical?: number;
    [k: string]: number | undefined;
  };
  detectedBiases: Array<{
    id: string;
    bias_type: string;
    column: string;
    severity: 'Low' | 'Moderate' | 'High' | 'Critical';
    description: string;
    ai_explanation: string;
    definition: string;
  }>;
  assessment: {
    fairness: string;
    recommendations: string[];
    conclusion: string;
  };
  distributions: any[];
  rawBiasReport?: any[];
  plots?: {
    fig1?: { plotly?: any; png_base64?: string | null } | null;
    fig2?: { plotly?: any; png_base64?: string | null } | null;
    fig3?: { plotly?: any; png_base64?: string | null } | null;
    error?: string;
  };
}

export default function App() {
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard'>('upload');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userHistory, setUserHistory] = useState<AnalysisResult[]>([]);
  const [autoSavePending, setAutoSavePending] = useState<AnalysisResult | null>(null);

  // Buckets and backend URL
  // const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5000';
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

  // On app load, ping backend to warm up service and check connectivity
  React.useEffect(() => {
    // Safe placeholder call to warm up backend
    fetch(`${BACKEND_URL}/api/ping`)
      .then(res => res.json())
      .then(data => {
        if (data?.status === 'ok') {
          console.log(`✅ Backend warmup successful: ${BACKEND_URL}/api/ping`);
        } else {
          console.warn(`⚠️ Backend /api/ping responded with unexpected data:`, data);
        }
      })
      .catch(err => {
        console.error(`❌ Failed to warm up backend: ${BACKEND_URL}/api/ping`, err);
      });
  }, [BACKEND_URL]);
  const BUCKET_JSON = (import.meta as any).env?.VITE_SUPABASE_BUCKET_ANALYSIS_JSON || 'analysis_json';
  const BUCKET_PDF = (import.meta as any).env?.VITE_SUPABASE_BUCKET_PDF_BIAS_REPORTS || 'pdf_bias_reports';
  // Allow opting out of saving a local copy on the backend. Default: false (don't save locally).
  const ENABLE_LOCAL_SAVE = String((import.meta as any).env?.VITE_SAVE_LOCAL_COPY ?? 'false').toLowerCase() === 'true';

  // Build a full-quality HTML snapshot (identical to Preview) — optional server-side rendering path
  async function generateAnalysisHtmlSnapshot(result: AnalysisResult): Promise<Blob> {
    const previewContainers = document.querySelectorAll('[data-pdf-preview-root]');
    const el = (previewContainers[0] as HTMLElement | undefined) || document.body;
    const { generateFullQualityPDF } = await import('./services/reportPdf');
    return generateFullQualityPDF(result, el);
  }

  // pdfmake-based PDF Blob for upload (current client-side approach)
  async function generatePdfBlobForUpload(result: AnalysisResult): Promise<Blob> {
    async function loadPdfMakeFromCdn(): Promise<any> {
      const w = window as any;
      if (w.pdfMake?.vfs) return w.pdfMake;
      function inject(src: string) {
        return new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src; s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(s);
        });
      }
      await inject('https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/pdfmake.min.js');
      await inject('https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/vfs_fonts.js');
      if (!w.pdfMake?.vfs) throw new Error('Failed to load pdf fonts (vfs)');
      return w.pdfMake;
    }

    let pdfMake: any = null;
    try {
      const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
      pdfMake = pdfMakeMod?.default ?? pdfMakeMod;
      let vfs: any = null;
      try {
        const fontsMod: any = await import('pdfmake/build/vfs_fonts');
        vfs = fontsMod?.pdfMake?.vfs
          ?? fontsMod?.default?.pdfMake?.vfs
          ?? fontsMod?.vfs
          ?? fontsMod?.default?.vfs
          ?? (typeof window !== 'undefined' ? (window as any).pdfMake?.vfs : undefined);
      } catch {}
      if (!vfs) {
        try { await import('pdfmake/build/vfs_fonts'); vfs = (pdfMake as any)?.vfs ?? (typeof window !== 'undefined' ? (window as any).pdfMake?.vfs : undefined); } catch {}
      }
      if (vfs) { pdfMake.vfs = vfs; } else { pdfMake = await loadPdfMakeFromCdn(); }
    } catch { pdfMake = await loadPdfMakeFromCdn(); }

    // Try to include the app logo in pdfMake fallback as a data URL so fallback PDFs also show it
    async function blobToDataUrl(b: Blob): Promise<string> {
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onloadend = () => resolve(String(fr.result));
        fr.onerror = (e) => reject(e);
        fr.readAsDataURL(b);
      });
    }

    async function loadLogoDataUrl(): Promise<string | null> {
      try {
        const resp = await fetch(Logo);
        if (!resp.ok) return null;
        const b = await resp.blob();
        return await blobToDataUrl(b);
      } catch {
        return null;
      }
    }

    const logoDataUrl = await loadLogoDataUrl();

    const docDefinition: any = {
      images: logoDataUrl ? { logo: logoDataUrl } : undefined,
      content: [
        // Header: logo + title
        logoDataUrl
          ? { columns: [{ image: 'logo', width: 40, height: 40 }, { text: 'D-BIAS Analysis Report', style: 'h1', margin: [10, 0, 0, 0] }], margin: [0, 0, 0, 8] }
          : { text: 'D-BIAS Analysis Report', style: 'h1' },
        { text: result.datasetName, style: 'h2', margin: [0, 2, 0, 12] },
        { text: `Generated: ${new Date(result.uploadDate).toLocaleString()}`, style: 'meta', margin: [0, 0, 0, 10] },
        { columns: [
          { text: `Fairness Score: ${result.fairnessScore}/100` },
          { text: `Fairness Label: ${result.fairnessLabel}` },
          { text: `Bias Risk: ${result.biasRisk}` },
        ], margin: [0, 0, 0, 10] },
        { text: 'Detected Biases', style: 'h3', margin: [0, 6, 0, 6] },
        { ul: result.detectedBiases.slice(0, 20).map(b => `${b.bias_type} (col: ${b.column}) — ${b.severity}`) },
        { text: 'Recommendations', style: 'h3', margin: [0, 8, 0, 4] },
        { ul: result.assessment.recommendations.slice(0, 20) },
        { text: 'Conclusion', style: 'h3', margin: [0, 8, 0, 2] },
        { text: result.assessment.conclusion || '', style: 'p' },
      ],
      styles: { h1: { fontSize: 18, bold: true }, h2: { fontSize: 14, bold: true }, h3: { fontSize: 12, bold: true }, meta: { fontSize: 9, color: '#64748b' }, p: { fontSize: 10 } },
      defaultStyle: { fontSize: 10 }, pageMargins: [40, 40, 40, 40],
    } as any;

    return new Promise<Blob>((resolve, reject) => {
      try { pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => resolve(blob)); } catch (e) { reject(e); }
    });
  }

  // Fetch the locally cached analysis JSON via backend (/api/analysis/latest)
  async function fetchLocalAnalysisJson(): Promise<any | null> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/analysis/latest`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function sanitizePathPart(s: string): string {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'dataset';
  }

  // Save analysis flow: generate 1:1 HTML snapshot if available, render to PDF via backend, save locally, upload, then insert DB row
  async function saveAnalysisFlow(result: AnalysisResult) {
    // 1) Generate PDF (client-side only)
    let pdfBlob: Blob | null = null;
    try {
      pdfBlob = await generatePdfBlobForUpload(result);
    } catch (e) {
      throw new Error('PDF generation failed');
    }
    if (!pdfBlob) throw new Error('PDF generation failed');

    // 1a) Optionally save PDF to local program_generated_files via backend endpoint
    if (ENABLE_LOCAL_SAVE) {
      try {
        const fd = new FormData();
        const ts = new Date(result.uploadDate || Date.now()).toISOString().replace(/[:.]/g, '-');
        const base = sanitizePathPart(result.datasetName || 'dataset');
        const localName = `dbias_report_${ts}_${base}.pdf`;
        fd.append('file', pdfBlob, localName);
        fd.append('filename', localName);
        // Fire-and-forget but await to allow backend to return early errors
        await fetch(`${BACKEND_URL}/api/save_pdf`, { method: 'POST', body: fd });
      } catch {
        // Non-fatal: local write failed or disabled; continue with Supabase uploads
      }
    }

    // 2) Fetch cached analysis JSON
    // Suppress toast: Fetching analysis JSON
    const cached = await fetchLocalAnalysisJson();
    if (!cached) throw new Error('Cached analysis JSON not found');
    const jsonBlob = new Blob([JSON.stringify(cached, null, 2)], { type: 'application/json' });

    // 3) Upload files to Supabase
    // Suppress toast: Uploading files
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error('Not authenticated');
    const rid = Math.random().toString(36).slice(2, 8);
    const ts = new Date(result.uploadDate || Date.now()).toISOString().replace(/[:.]/g, '-');
    const base = sanitizePathPart(result.datasetName || 'dataset');
    const basePath = `${user.id}/${ts}_${base}_${rid}`;

    const jsonPath = `${basePath}.json`;
    const pdfPath = `${basePath}.pdf`;
    const [jsonUrl, pdfUrl] = await Promise.all([
      uploadFile(BUCKET_JSON, jsonPath, jsonBlob, 'application/json'),
      uploadFile(BUCKET_PDF, pdfPath, pdfBlob, 'application/pdf'),
    ]);

    // 4) Insert DB row
    // Suppress toast: Saving analysis
    await saveAnalysisRow({ analysis_json_url: jsonUrl, report_url: pdfUrl, description: result.datasetName });
  }

  const handleAnalysisComplete = async (result: AnalysisResult) => {
    // Set state first so hidden preview mounts before we try to render
    setAnalysisResult(result);
    setCurrentView('dashboard');
    if (isAuthenticated) {
      // Defer save until after the DOM commits to ensure hidden preview exists
      setAutoSavePending(result);
    }
  };

  // After analysisResult renders (hidden preview present), run the save flow
  useEffect(() => {
    if (!autoSavePending) return;
    let cancelled = false;
    // Wait a frame to be extra-safe for DOM commit
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;
      try {
        await saveAnalysisFlow(autoSavePending);
        // Suppress success toast
        const saved = await loadSavedAnalyses();
        if (saved?.length) setUserHistory(saved);
      } catch (e: any) {
        // Suppress error toast
        setUserHistory((prev) => [autoSavePending, ...prev]);
      } finally {
        setAutoSavePending(null);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [autoSavePending]);

  const handleBackToUpload = () => {
    setCurrentView('upload');
    setAnalysisResult(null);
  };

  const handleLogin = () => setIsAuthenticated(true);

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    setIsAuthenticated(false);
    setCurrentView('upload');
    setAnalysisResult(null);
  };

  const handleViewHistory = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setCurrentView('dashboard');
  };

  // Initialize auth state from Supabase and subscribe to changes
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const session = await getSession();
        setIsAuthenticated(!!session);
        if (session) {
          try { const saved = await loadSavedAnalyses(); if (saved?.length) setUserHistory(saved); } catch {}
        }
      } catch {}
      unsub = onAuthStateChange(() => {
        // re-check session when an auth event fires
        getSession()
          .then(async (s) => {
            setIsAuthenticated(!!s);
            if (s) {
              try { const saved = await loadSavedAnalyses(); if (saved?.length) setUserHistory(saved); } catch {}
            } else {
              setUserHistory([]);
            }
          })
          .catch(() => setIsAuthenticated(false));
      });
    })();
    return () => { try { unsub(); } catch {} };
  }, []);

  // After becoming authenticated, ensure a profile row exists
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => { try { await ensureUserProfile(); } catch {} })();
  }, [isAuthenticated]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
        {/* Sidebar/ToggleMenu removed. Header now exposes History/Profile/Logout controls. */}

        <div className="flex-1">
          {currentView === 'upload' ? (
            <UploadPage
              onAnalysisComplete={handleAnalysisComplete}
              isAuthenticated={isAuthenticated}
              onLogin={handleLogin}
              onLogout={handleLogout}
              userHistory={userHistory}
              onViewHistory={handleViewHistory}
            />
          ) : (
            analysisResult && (
              <Dashboard
                result={analysisResult}
                onBackToUpload={handleBackToUpload}
                isAuthenticated={isAuthenticated}
                onLogin={handleLogin}
                onLogout={handleLogout}
                userHistory={userHistory}
                onViewHistory={handleViewHistory}
              />
            )
          )}
        </div>
      </div>
      {/* Hidden always-mounted preview root for 1:1 server-rendered PDF */}
      {analysisResult && (
        <div
          data-pdf-preview-root
          data-hidden-preview="true"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-10000px',
            top: 0,
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
          className="bg-white p-8 border border-slate-200 rounded-lg"
        >
          <ReportPreviewContent result={analysisResult} />
        </div>
      )}
      <Toaster />
    </>
  );
}