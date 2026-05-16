import { useEffect, useMemo, useRef, useState } from 'react';
import { normalize, type Folder } from '../lib/folder-match';

type Props = {
  folders: Folder[];
  initialQuery?: string;
  onSelect: (folder: Folder | { kind: 'pendente'; name: string }) => void;
  onClose: () => void;
};

const MAX_RESULTS = 40;

export function FolderSearch({ folders, initialQuery = '', onSelect, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return folders.slice(0, MAX_RESULTS);
    const tokens = q.split(' ').filter(Boolean);
    const ranked: { folder: Folder; score: number }[] = [];
    for (const f of folders) {
      const n = normalize(f.name);
      // All tokens must appear (substring match)
      if (!tokens.every((t) => n.includes(t))) continue;
      // Score: lower is better — prefer shorter names and earlier matches
      const firstIdx = n.indexOf(tokens[0]);
      const score = firstIdx + n.length * 0.01;
      ranked.push({ folder: f, score });
    }
    ranked.sort((a, b) => a.score - b.score);
    return ranked.slice(0, MAX_RESULTS).map((r) => r.folder);
  }, [folders, query]);

  const trimmedQuery = query.trim();
  const showPendenteOption = trimmedQuery.length > 0 && !results.some((f) => normalize(f.name) === normalize(trimmedQuery));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy-deep/85 backdrop-blur-md animate-slide-down" role="dialog">
      <button
        onClick={onClose}
        className="absolute inset-0 -z-10"
        aria-label="Fechar"
      />

      <div className="mx-auto mt-[max(env(safe-area-inset-top),1rem)] flex h-[calc(100svh-max(env(safe-area-inset-top),1rem)-1rem)] w-full max-w-2xl flex-col rounded-t-3xl bg-bone shadow-lifted">
        {/* Drag handle */}
        <div className="mx-auto mt-2 mb-1 h-1 w-12 rounded-full bg-navy/15" aria-hidden />

        {/* Header */}
        <div className="px-5 pt-2 pb-3">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">
              Escolher pasta
            </p>
            <button
              onClick={onClose}
              className="font-mono text-[11px] tracking-wider uppercase text-navy/60 active:scale-95"
            >
              Cancelar
            </button>
          </div>
          <h2 className="mt-1 font-serif text-2xl italic text-navy">
            {folders.length} pacientes
          </h2>
        </div>

        {/* Search input */}
        <div className="px-5 pb-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="search"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome…"
              className="w-full rounded-2xl border border-navy/10 bg-bone-50 px-4 py-3.5 pr-10 font-serif text-lg italic text-navy placeholder:text-navy/30 focus:border-amber focus:outline-none"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full bg-navy/8 text-navy/60 active:scale-90"
                aria-label="Limpar"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <ol className="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {results.length === 0 && !showPendenteOption && (
            <li className="py-12 text-center font-serif text-lg italic text-navy/40">
              Nenhuma paciente encontrada com esse nome.
            </li>
          )}

          {showPendenteOption && (
            <li className="mb-3">
              <button
                onClick={() => onSelect({ kind: 'pendente', name: trimmedQuery })}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-cyan/40 bg-cyan/5 px-4 py-3.5 text-left transition active:scale-[0.99]"
              >
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-cyan-600">
                    _Pendentes (criar)
                  </p>
                  <p className="mt-0.5 font-serif text-lg italic text-navy">
                    {trimmedQuery}
                  </p>
                </div>
                <span className="font-mono text-[11px] tracking-wider uppercase text-cyan-600">+</span>
              </button>
            </li>
          )}

          {results.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onSelect(f)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-bone-50 active:scale-[0.99] active:bg-bone-200"
              >
                <span className="font-serif text-base text-navy break-words">{f.name}</span>
                <span className="ml-3 font-mono text-[11px] tracking-wider uppercase text-amber-600">→</span>
              </button>
            </li>
          ))}

          {folders.length > results.length && !query && (
            <li className="py-5 text-center font-mono text-[10px] tracking-wider uppercase text-navy/40">
              Mostrando {results.length} de {folders.length} — digite pra refinar
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
