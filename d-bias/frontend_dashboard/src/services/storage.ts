import { supabase } from '../lib/supabase';
import Logo from '../assets/logo_ver2.png';
import { getCurrentUser } from './auth';
import type { AnalysisResult } from '../App';

const BUCKET_JSON = (import.meta as any).env?.VITE_SUPABASE_BUCKET_ANALYSIS_JSON || 'analysis_json';
const BUCKET_PDF = (import.meta as any).env?.VITE_SUPABASE_BUCKET_PDF_BIAS_REPORTS || 'pdf_bias_reports';
// If your buckets are private (recommended), set this to 'false' in .env and
// we'll return signed URLs instead of public URLs.
const STORAGE_PUBLIC = String((import.meta as any).env?.VITE_SUPABASE_STORAGE_PUBLIC ?? 'true').toLowerCase() === 'true';

export async function uploadFile(bucket: string, path: string, blob: Blob, contentType: string): Promise<string> {
  // Use upsert so repeated analyses of same dataset timestamp do not fail.
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: true });
  if (error) {
    const msg = String(error?.message || error);
    const code = (error as any)?.statusCode ?? (error as any)?.status ?? '';
    if (/not\s*found|bucket/i.test(msg) || code === 404) {
      throw new Error(`Bucket '${bucket}' not found or inaccessible. Create it in Supabase Storage and ensure RLS policies allow authenticated uploads.`);
    }
    if (/row-level security|RLS|not allowed|permission/i.test(msg) || code === 401 || code === 403) {
      throw new Error(`Storage RLS blocked upload to bucket '${bucket}'. Update policies to allow authenticated users to insert/update objects under their user_id prefix.`);
    }
    throw new Error(`Storage upload error (${bucket}/${path}): ${msg}`);
  }
  if (STORAGE_PUBLIC) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  // Private bucket: return a signed URL (max 7 days per Supabase limits)
  const expiresIn = Number((import.meta as any).env?.VITE_SUPABASE_SIGNED_URL_TTL_SEC ?? 60 * 60 * 24 * 7);
  const { data: signed, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (sErr || !signed?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${bucket}/${path}: ${sErr?.message || 'unknown error'}`);
  }
  return signed.signedUrl;
}

function sanitizePathPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'dataset';
}

export async function uploadAnalysisJson(result: AnalysisResult): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const ts = new Date(result.uploadDate || Date.now()).toISOString().replace(/[:.]/g, '-');
  const base = sanitizePathPart(result.datasetName || 'dataset');
  // Add short random suffix to avoid timestamp collision if same second
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${ts}_${base}_${rand}.json`;
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  return uploadFile(BUCKET_JSON, path, blob, 'application/json');
}

// Lazy-load pdfmake and generate a simple PDF summary
export async function generateAnalysisPdfBlob(result: AnalysisResult): Promise<Blob> {
  // Load pdfmake and fonts defensively to accommodate different bundler exports
  const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
  const pdfMake: any = pdfMakeMod?.default ?? pdfMakeMod;

  // First try a direct import for the fonts module
  const fontsMod: any = await import('pdfmake/build/vfs_fonts');

  // Some builds set vfs on the module export, others only as a side-effect on global pdfMake
  let vfs = fontsMod?.pdfMake?.vfs
    ?? fontsMod?.default?.pdfMake?.vfs
    ?? fontsMod?.vfs
    ?? fontsMod?.default?.vfs
    ?? (typeof window !== 'undefined' ? (window as any).pdfMake?.vfs : undefined);

  // If still not present, try a pure side-effect import which attaches to global pdfMake
  if (!vfs) {
    await import('pdfmake/build/vfs_fonts');
    vfs = pdfMake?.vfs
      ?? (typeof window !== 'undefined' ? (window as any).pdfMake?.vfs : undefined);
  }

  if (!vfs) {
    throw new Error('Failed to load pdf fonts (vfs)');
  }
  pdfMake.vfs = vfs;

  // Try to fetch the logo asset and convert to a data URL for pdfMake images
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
    styles: {
      h1: { fontSize: 18, bold: true },
      h2: { fontSize: 14, bold: true },
      h3: { fontSize: 12, bold: true },
      meta: { fontSize: 9, color: '#64748b' },
      p: { fontSize: 10 },
    },
    defaultStyle: { fontSize: 10 },
    pageMargins: [40, 40, 40, 40],
  };

  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => resolve(blob));
    } catch (e) {
      reject(e);
    }
  });
}

export async function uploadAnalysisPdf(result: AnalysisResult): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const ts = new Date(result.uploadDate || Date.now()).toISOString().replace(/[:.]/g, '-');
  const base = sanitizePathPart(result.datasetName || 'dataset');
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${ts}_${base}_${rand}.pdf`;
  const blob = await generateAnalysisPdfBlob(result);
  return uploadFile(BUCKET_PDF, path, blob, 'application/pdf');
}
