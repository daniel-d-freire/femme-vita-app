import { useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from './Logo';
import { FolderSearch } from './FolderSearch';
import {
  confidenceLabel,
  type AnalyzeResult,
  type UploadTarget,
} from '../lib/api';
import type { Folder, FolderMatch } from '../lib/folder-match';
import { matchFolder, buildFileName } from '../lib/folder-match';

type DocType = 'guia_internacao' | 'descricao_cirurgica' | 'guia_honorarios_assinada';
type Manual =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'pendente'; name: string };

type Props = {
  result: AnalyzeResult;
  pageCount: number;
  firstPageDataUrl: string;
  folders: Folder[];
  onSave: (
    target: UploadTarget,
    fileName: string,
    rotation: AnalyzeResult['rotation_to_apply']
  ) => void;
  onBackToReview: () => void;
};

type Rotation = 0 | 90 | 180 | 270;

export function ResultScreen({ result, pageCount, firstPageDataUrl, folders, onSave, onBackToReview }: Props) {
  const [editedName, setEditedName] = useState(result.patient_name);
  const [editedType, setEditedType] = useState<DocType | null>(result.document_type);
  const [editingName, setEditingName] = useState(false);
  const [manual, setManual] = useState<Manual | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [userRotation, setUserRotation] = useState<Rotation>(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Rotação final = o que Claude reportou + o ajuste manual do usuário.
  const effectiveRotation = (
    (result.rotation_to_apply + userRotation) % 360
  ) as Rotation;

  // Re-run matching whenever the edited name changes — unless user manually overrode.
  const autoMatch = useMemo<FolderMatch | null>(
    () => (editedName ? matchFolder(editedName, folders) : null),
    [editedName, folders]
  );

  // Resolved destination (manual override wins).
  const destination = useMemo(() => {
    if (manual) return manual;
    if (autoMatch) return { kind: 'folder' as const, folder: autoMatch.folder };
    return { kind: 'pendente' as const, name: editedName };
  }, [manual, autoMatch, editedName]);

  const fileName = useMemo(() => {
    if (!editedType) return null;
    const base = destination.kind === 'folder' ? destination.folder.name : destination.name;
    if (!base) return null;
    return buildFileName(editedType, base);
  }, [editedType, destination]);

  // Focus name input when entering edit mode.
  useEffect(() => {
    if (editingName) {
      const t = setTimeout(() => nameInputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [editingName]);

  const nameConf = confidenceLabel(result.confidence_name);
  const typeConf = confidenceLabel(result.confidence_type);
  const hasError = result.error !== null;

  const wasEdited = editedName !== result.patient_name || editedType !== result.document_type;
  const canSave = !!editedType && !!editedName && !hasError;

  const handleSave = () => {
    if (!fileName || !editedType) return;
    if (destination.kind === 'folder') {
      onSave({ kind: 'folderId', folderId: destination.folder.id }, fileName, effectiveRotation);
    } else {
      onSave({ kind: 'pendente', patientName: destination.name }, fileName, effectiveRotation);
    }
  };

  const cycleRotation = () => {
    setUserRotation((prev) => ((prev + 90) % 360) as Rotation);
  };

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      <header className="px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBackToReview}
            className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-navy/70 transition active:scale-95 active:text-navy"
          >
            ← Páginas
          </button>
          <Logo variant="dark" size="sm" />
        </div>
      </header>

      <div className="flex-1 px-5 pb-40">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
            Leitura concluída
          </p>
          <p className="font-mono text-[10px] tracking-wide uppercase text-navy/40">
            {(result.elapsedMs / 1000).toFixed(1)}s · {pageCount}p
          </p>
        </div>

        {hasError && <ErrorBanner error={result.error!} />}

        {/* Patient name */}
        <section className="mt-5 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Paciente {editedName !== result.patient_name && <span className="ml-1 text-amber-600">· editado</span>}
            </p>
            {!editingName && <ConfidenceBadge tone={nameConf.tone} value={result.confidence_name} />}
          </div>
          {editingName ? (
            <input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => { setEditedName(e.target.value); setManual(null); }}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false); }}
              autoCapitalize="characters"
              className="mt-2 w-full bg-transparent font-serif text-3xl leading-tight text-navy outline-none border-b-2 border-amber/60 pb-1 focus:border-amber"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="mt-2 flex w-full items-start justify-between gap-3 text-left transition active:opacity-70"
            >
              <h1 className="font-serif text-3xl leading-tight text-navy break-words">
                {editedName || <span className="italic text-navy/30">— não identificado —</span>}
              </h1>
              <PencilIcon />
            </button>
          )}
        </section>

        {/* Document type */}
        <section className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Tipo {editedType !== result.document_type && <span className="ml-1 text-amber-600">· editado</span>}
            </p>
            <ConfidenceBadge tone={typeConf.tone} value={result.confidence_type} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <TypeButton
              active={editedType === 'guia_internacao'}
              onClick={() => setEditedType('guia_internacao')}
              icon={<GuiaIcon />}
              label="Guia de internação"
            />
            <TypeButton
              active={editedType === 'descricao_cirurgica'}
              onClick={() => setEditedType('descricao_cirurgica')}
              icon={<DescricaoIcon />}
              label="Descrição cirúrgica"
            />
            <TypeButton
              active={editedType === 'guia_honorarios_assinada'}
              onClick={() => setEditedType('guia_honorarios_assinada')}
              icon={<HonorariosIcon />}
              label="Guia de honorários assinada"
            />
          </div>
        </section>

        {/* Destination */}
        <section className={`mt-3 overflow-hidden rounded-2xl border p-5 shadow-soft ${
          destination.kind === 'folder'
            ? autoMatch && !manual && autoMatch.confidence === 1.0
              ? 'border-success/30 bg-success/5'
              : 'border-amber/30 bg-amber/5'
            : 'border-cyan/30 bg-cyan/5'
        }`}>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Destino</p>
            {manual ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/15 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase text-amber-600">
                <span className="h-1 w-1 rounded-full bg-current" /> Manual
              </span>
            ) : autoMatch ? (
              <MatchBadge confidence={autoMatch.confidence} method={autoMatch.method} />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/15 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase text-cyan-600">
                <span className="h-1 w-1 rounded-full bg-current" /> _Pendentes
              </span>
            )}
          </div>
          <div className="mt-2">
            {destination.kind === 'folder' ? (
              <p className="font-serif text-2xl italic text-navy break-words">{destination.folder.name}</p>
            ) : (
              <>
                <p className="font-serif text-xl italic text-navy/80 break-words">Pasta não encontrada</p>
                <p className="mt-1 font-mono text-[11px] text-navy/50">
                  Vai pra <span className="text-cyan-600">_Pendentes / {destination.name}</span>
                </p>
              </>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-navy/8 pt-3">
            <button
              onClick={() => setShowSearch(true)}
              className="font-mono text-[11px] tracking-wider uppercase text-navy/70 transition active:scale-95 active:text-navy"
            >
              ↻ Trocar pasta
            </button>
            {fileName && (
              <p className="ml-3 truncate font-mono text-[11px] text-navy/40">
                {fileName}
              </p>
            )}
          </div>
        </section>

        {/* Preview da orientação — usuária confirma visualmente antes de salvar */}
        {firstPageDataUrl && (
          <section className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
                Pré-visualização {userRotation !== 0 && <span className="ml-1 text-amber-600">· ajustada</span>}
              </p>
              <p className="font-mono text-[10px] tracking-wide uppercase text-navy/40">
                {effectiveRotation}°
              </p>
            </div>
            <div className="mt-3 flex items-stretch gap-3">
              <div className="h-36 w-36 flex-none grid place-items-center overflow-hidden rounded-xl border border-navy/10 bg-bone">
                <img
                  src={firstPageDataUrl}
                  alt="prévia da página"
                  style={{ transform: `rotate(${effectiveRotation}deg)` }}
                  className="max-h-full max-w-full transition-transform duration-300 ease-out"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between gap-2">
                <p className="font-serif text-sm italic leading-snug text-navy/70">
                  Confira se o documento está em pé. Se não, gire.
                </p>
                <button
                  onClick={cycleRotation}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-navy/15 bg-bone px-4 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-95"
                >
                  <RotateIcon /> Girar 90°
                </button>
              </div>
            </div>
          </section>
        )}

        {wasEdited && (
          <p className="mt-3 text-center font-mono text-[10px] tracking-wider uppercase text-amber-600">
            ✱ correções manuais detectadas
          </p>
        )}
      </div>

      {/* Footer actions */}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-navy/8 bg-bone/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToReview}
            className="flex h-14 flex-[0.7] items-center justify-center rounded-2xl border border-navy/15 bg-bone-50 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-[0.98]"
          >
            Voltar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex h-14 flex-[1.6] items-center justify-center gap-2 rounded-2xl bg-amber px-3 font-mono text-[11px] tracking-wider uppercase text-navy-deep shadow-amber transition active:scale-[0.98] disabled:opacity-40 disabled:bg-bone-200 disabled:shadow-none"
          >
            {destination.kind === 'folder' ? (
              <>Salvar em <span className="ml-1 max-w-[140px] truncate normal-case font-serif italic">{destination.folder.name}</span></>
            ) : (
              'Salvar em _Pendentes'
            )}
            <span>→</span>
          </button>
        </div>
      </footer>

      {showSearch && (
        <FolderSearch
          folders={folders}
          initialQuery={editedName}
          onSelect={(sel) => {
            if ('id' in sel) {
              setManual({ kind: 'folder', folder: sel });
            } else {
              setManual({ kind: 'pendente', name: sel.name });
            }
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

function TypeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
        active
          ? 'border-navy bg-navy text-bone shadow-soft'
          : 'border-navy/15 bg-bone text-navy/60 hover:border-navy/30'
      }`}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? 'bg-bone/15 text-amber' : 'bg-navy/8 text-navy/50'}`}>
        {icon}
      </span>
      <span className="font-serif text-sm italic leading-tight">{label}</span>
    </button>
  );
}

function ConfidenceBadge({ tone, value }: { tone: 'high' | 'medium' | 'low'; value: number }) {
  const styles = {
    high: 'bg-success/15 text-success border-success/30',
    medium: 'bg-amber/15 text-amber-600 border-amber/30',
    low: 'bg-danger/15 text-danger border-danger/30',
  }[tone];
  const label = { high: 'Alta', medium: 'Média', low: 'Baixa' }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${styles}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {label} · {(value * 100).toFixed(0)}%
    </span>
  );
}

function MatchBadge({ confidence, method }: { confidence: number; method: string }) {
  const isExact = confidence === 1.0;
  const styles = isExact
    ? 'bg-success/15 text-success border-success/30'
    : 'bg-amber/15 text-amber-600 border-amber/30';
  const label = isExact ? 'Exato' : method === 'levenshtein' ? 'Aprox.' : 'Parcial';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${styles}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {label} · {(confidence * 100).toFixed(0)}%
    </span>
  );
}

function PencilIcon() {
  return (
    <span className="mt-2 grid h-7 w-7 flex-none place-items-center rounded-md bg-navy/8 text-navy/50">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m14.121 15.536-2.121 2.121a4 4 0 0 1-5.657-5.657l3.536-3.536" /><path d="M3 21h6l11-11a2.121 2.121 0 0 0-3-3L6 18v3z" />
      </svg>
    </span>
  );
}

function GuiaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function DescricaoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m14.121 15.536-2.121 2.121a4 4 0 0 1-5.657-5.657l3.536-3.536" /><path d="M3 21h6l11-11a2.121 2.121 0 0 0-3-3L6 18v3z" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 12a9 9 0 1 1-9-9c2.34 0 4.5.91 6.13 2.4" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function HonorariosIcon() {
  // Document with a signature swoosh + underline — signals "assinada".
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M8 14c1.5-1.5 2.5 1 4 0s2.5-1.5 4 0" />
      <path d="M8 18h8" />
    </svg>
  );
}

function ErrorBanner({ error }: { error: 'not_recognized' | 'multiple_documents' }) {
  const message =
    error === 'not_recognized'
      ? 'Não reconheci este documento como guia de internação, descrição cirúrgica ou guia de honorários assinada.'
      : 'Detectei mais de um documento na imagem. Tire fotos separadas, um documento por vez.';

  return (
    <div className="mt-3 rounded-2xl border border-danger/30 bg-danger/8 p-4">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">Atenção</p>
      <p className="mt-1.5 font-serif text-base italic leading-snug text-navy">{message}</p>
    </div>
  );
}

