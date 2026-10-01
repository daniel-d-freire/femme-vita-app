import { downscaleDataUrl, type CapturedPage } from './camera';
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

export type Modo = 'geral' | 'sadt';

/** Resposta do /api/analyze no modo SADT (espelha SadtResultSchema do servidor). */
export type SadtAnalyzeResult = {
  e_guia_sadt: boolean;
  patient_name: string;
  data_autorizacao: string;
  senha: string;
  carteira: string;
  codigo_procedimento: string;
  /** Decidido pela descrição (campo 26): o código impresso pequeno o Vision lê errado. */
  e_consulta: boolean;
  confidence_name: number;
  confidence_data: number;
  confidence_senha: number;
  error: 'not_recognized' | 'multiple_documents' | null;
  rotation_to_apply: 0 | 90 | 180 | 270;
  elapsedMs: number;
};

/** O que vai para o registro do faturamento (espelha SadtUploadSchema do servidor). */
export type SadtDados = {
  paciente: string;
  nomeNaGuia: string;
  data: string;
  senha: string;
  carteira: string;
  codigoProcedimento: string;
};

export type AnalyzeError = {
  error: string;
  message?: string;
  details?: string[];
};

const API_BASE = import.meta.env.DEV ? '' : '';

async function postAnalyze(pages: CapturedPage[], modo: Modo): Promise<unknown> {
  // O Claude reduz imagens para ~1568px de qualquer forma; mandar a versão
  // grande só deixa a requisição mais lenta.
  const images = await Promise.all(pages.map((p) => downscaleDataUrl(p.dataUrl)));
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, modo }),
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

  return response.json();
}

export async function analyzePages(pages: CapturedPage[]): Promise<AnalyzeResult> {
  return (await postAnalyze(pages, 'geral')) as AnalyzeResult;
}

export async function analyzeSadtPages(pages: CapturedPage[]): Promise<SadtAnalyzeResult> {
  return (await postAnalyze(pages, 'sadt')) as SadtAnalyzeResult;
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
  /** SADT: já havia arquivo com o mesmo nome e o servidor acrescentou _2, _3… */
  renomeado?: boolean;
  /** SADT: o PDF foi salvo mas o registro do faturamento não. */
  registroFalhou?: boolean;
  sizeKb: number;
  timing: { pdfMs: number; uploadMs: number; totalMs: number };
};

export type UploadTarget =
  | { kind: 'folderId'; folderId: string }
  | { kind: 'pendente'; patientName: string };

export async function uploadDocument(
  pages: CapturedPage[],
  fileName: string,
  target: UploadTarget,
  sadt?: SadtDados
): Promise<UploadResponse> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      images: pages.map((p) => p.dataUrl),
      fileName,
      target,
      sadt,
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
