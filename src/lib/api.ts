import type { CapturedPage } from './camera';
import type { FolderMatch } from './folder-match';

export type AuthUser = {
  email: string;
  name?: string;
  picture?: string;
};

export type AuthState =
  | { authenticated: false }
  | { authenticated: true; user: AuthUser; apoloFolderResolved: boolean };

export type FoldersResponse = {
  apoloFolderId: string;
  folders: { id: string; name: string }[];
  cached: boolean;
};

export async function fetchAuthState(): Promise<AuthState> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) throw new Error(`auth_check_failed:${response.status}`);
  return (await response.json()) as AuthState;
}

export async function fetchFolders(reload = false): Promise<FoldersResponse> {
  const url = reload ? '/api/folders?reload=1' : '/api/folders';
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    let body: AnalyzeError = { error: 'http_error', message: `HTTP ${response.status}` };
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as FoldersResponse;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export type AnalyzeResult = {
  patient_name: string;
  document_type: 'guia_internacao' | 'descricao_cirurgica' | 'guia_honorarios_assinada' | null;
  confidence_name: number;
  confidence_type: number;
  error: 'not_recognized' | 'multiple_documents' | null;
  rotation_to_apply: 0 | 90 | 180 | 270;
  elapsedMs: number;
};

export type AnalyzeError = {
  error: string;
  message?: string;
  details?: string[];
};

const API_BASE = import.meta.env.DEV ? '' : '';

export async function analyzePages(pages: CapturedPage[]): Promise<AnalyzeResult> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: pages.map((p) => p.dataUrl) }),
  });

  if (!response.ok) {
    let body: AnalyzeError;
    try {
      body = await response.json();
    } catch {
      body = { error: 'http_error', message: `HTTP ${response.status}` };
    }
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as AnalyzeResult;
}

export class ApiError extends Error {
  status: number;
  body: AnalyzeError;
  constructor(status: number, body: AnalyzeError) {
    super(body.message || body.error);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function formatDocumentType(type: AnalyzeResult['document_type']): string {
  if (type === 'guia_internacao') return 'Guia de internação';
  if (type === 'descricao_cirurgica') return 'Descrição cirúrgica';
  if (type === 'guia_honorarios_assinada') return 'Guia de honorários assinada';
  return 'Não identificado';
}

export function confidenceLabel(value: number): { label: string; tone: 'high' | 'medium' | 'low' } {
  if (value >= 0.95) return { label: 'Alta', tone: 'high' };
  if (value >= 0.75) return { label: 'Média', tone: 'medium' };
  return { label: 'Baixa', tone: 'low' };
}

export type UploadResponse = {
  ok: true;
  fileId: string;
  fileName: string;
  webViewLink?: string;
  folderId: string;
  folderName: string;
  wasPendente: boolean;
  sizeKb: number;
  timing: { pdfMs: number; uploadMs: number; totalMs: number };
};

export type UploadTarget =
  | { kind: 'folderId'; folderId: string }
  | { kind: 'pendente'; patientName: string };

export async function uploadDocument(
  pages: CapturedPage[],
  fileName: string,
  target: UploadTarget
): Promise<UploadResponse> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      images: pages.map((p) => p.dataUrl),
      fileName,
      target,
    }),
  });
  if (!response.ok) {
    let body: AnalyzeError = { error: 'http_error', message: `HTTP ${response.status}` };
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as UploadResponse;
}

/**
 * Auto-save eligibility per spec §4.6:
 *   min(confidence_name, confidence_type) ≥ 0.95
 *   AND match exists with confidence 1.0 (exact)
 */
export function isAutoSaveEligible(
  result: AnalyzeResult,
  match: FolderMatch | null
): boolean {
  if (result.error !== null) return false;
  if (!result.document_type) return false;
  if (!match) return false; // _Pendentes case → still needs intent to click
  if (match.confidence !== 1.0) return false;
  // Guia de honorários assinada sempre cai na ResultScreen pra o faturista
  // confirmar visualmente a orientação — vision models erram esse campo às vezes.
  if (result.document_type === 'guia_honorarios_assinada') return false;
  return Math.min(result.confidence_name, result.confidence_type) >= 0.95;
}
