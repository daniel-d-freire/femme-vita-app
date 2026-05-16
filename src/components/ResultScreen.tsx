import { Logo } from './Logo';
import { confidenceLabel, formatDocumentType, type AnalyzeResult } from '../lib/api';

type Props = {
  result: AnalyzeResult;
  pageCount: number;
  onRestart: () => void;
  onBackToReview: () => void;
};

export function ResultScreen({ result, pageCount, onRestart, onBackToReview }: Props) {
  const nameConf = confidenceLabel(result.confidence_name);
  const typeConf = confidenceLabel(result.confidence_type);
  const hasError = result.error !== null;

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 px-5 pb-32">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
            Leitura concluída
          </p>
          <p className="font-mono text-[10px] tracking-wide uppercase text-navy/40">
            {(result.elapsedMs / 1000).toFixed(1)}s · {pageCount}p
          </p>
        </div>

        {hasError && <ErrorBanner error={result.error!} />}

        {/* Patient name card */}
        <section className="mt-5 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Paciente
            </p>
            <ConfidenceBadge tone={nameConf.tone} value={result.confidence_name} />
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-tight text-navy break-words">
            {result.patient_name || <span className="italic text-navy/30">— não identificado —</span>}
          </h1>
        </section>

        {/* Document type card */}
        <section className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Tipo
            </p>
            <ConfidenceBadge tone={typeConf.tone} value={result.confidence_type} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <DocTypeIcon type={result.document_type} />
            <p className="font-serif text-2xl italic text-navy">
              {formatDocumentType(result.document_type)}
            </p>
          </div>
        </section>

        {/* Coming soon: folder match (M3+) */}
        <section className="mt-3 rounded-2xl border border-dashed border-navy/15 bg-bone p-5">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Próximo
            </p>
            <span className="font-mono text-[10px] tracking-wider uppercase text-cyan-600">
              M3 + M4
            </span>
          </div>
          <p className="mt-2 font-serif text-lg italic text-navy/50 leading-snug">
            Buscar a pasta da paciente no Drive, gerar PDF e salvar.
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-navy/8 bg-bone/90 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToReview}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-navy/15 bg-bone-50 font-mono text-[11px] tracking-wider uppercase text-navy transition active:scale-[0.98]"
          >
            Voltar
          </button>
          <button
            onClick={onRestart}
            className="flex h-14 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-navy font-mono text-[11px] tracking-wider uppercase text-bone shadow-lifted transition active:scale-[0.98]"
          >
            Novo documento <span className="text-amber">→</span>
          </button>
        </div>
      </footer>
    </div>
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

function DocTypeIcon({ type }: { type: AnalyzeResult['document_type'] }) {
  if (type === 'guia_internacao') {
    return (
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/15 text-cyan-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 12h6M9 16h4" />
        </svg>
      </div>
    );
  }
  if (type === 'descricao_cirurgica') {
    return (
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber/15 text-amber-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m14.121 15.536-2.121 2.121a4 4 0 0 1-5.657-5.657l3.536-3.536" /><path d="M3 21h6l11-11a2.121 2.121 0 0 0-3-3L6 18v3z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy/8 text-navy/40">
      <span className="text-xl">?</span>
    </div>
  );
}

function ErrorBanner({ error }: { error: 'not_recognized' | 'multiple_documents' }) {
  const message =
    error === 'not_recognized'
      ? 'Não reconheci este documento como guia de internação nem descrição cirúrgica.'
      : 'Detectei mais de um documento na imagem. Tire fotos separadas, um documento por vez.';

  return (
    <div className="mt-3 rounded-2xl border border-danger/30 bg-danger/8 p-4">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">Atenção</p>
      <p className="mt-1.5 font-serif text-base italic leading-snug text-navy">{message}</p>
    </div>
  );
}
