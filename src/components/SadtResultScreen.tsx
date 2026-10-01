// src/components/SadtResultScreen.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from './Logo';
import { FolderSearch } from './FolderSearch';
import { confidenceLabel, type SadtAnalyzeResult, type SadtDados, type UploadTarget } from '../lib/api';
import type { Folder } from '../lib/folder-match';
import { alvoDoDestino, nomeBaseDoDestino, useDestino } from '../lib/useDestino';
import { avisosSadt, dataBrParaIso, nomeArquivoSadt, type AvisoSadt } from '../lib/sadt';
import { BannerErro, CartaoDestino, ConfidenceBadge, PencilIcon, PreviewOrientacao } from './result-parts';

type Rotation = 0 | 90 | 180 | 270;

type Props = {
  result: SadtAnalyzeResult;
  pageCount: number;
  firstPageDataUrl: string;
  folders: Folder[];
  onSave: (target: UploadTarget, fileName: string, rotation: Rotation, sadt: SadtDados) => void;
  onBackToReview: () => void;
};

const TEXTO_AVISO: Record<AvisoSadt, string> = {
  nao_e_consulta:
    'Esta guia não parece ser de consulta. O robô só fatura consulta (98250159); exame ou procedimento vai aparecer como pendência no faturamento.',
  senha_duvidosa: 'Confira a senha com o campo 5 da guia em papel.',
  data_duvidosa: 'Confira a data com o campo 4 (Data da Autorização) da guia em papel.',
};

const TEXTO_ERRO = {
  not_recognized:
    'Isto não parece uma guia SADT da MedSênior. Guia de internação, descrição cirúrgica e honorários se digitalizam pelo Arquivo normal.',
  multiple_documents: 'Detectei mais de um documento na imagem. Fotografe uma guia por vez.',
} as const;

export function SadtResultScreen({ result, pageCount, firstPageDataUrl, folders, onSave, onBackToReview }: Props) {
  const [editedName, setEditedName] = useState(result.patient_name);
  const [editingName, setEditingName] = useState(false);
  const [dataTexto, setDataTexto] = useState(result.data_autorizacao);
  const [senha, setSenha] = useState(result.senha);
  const [showSearch, setShowSearch] = useState(false);
  const [userRotation, setUserRotation] = useState<Rotation>(0);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { destination, autoMatch, manual, setManual } = useDestino(editedName, folders);

  const effectiveRotation = ((result.rotation_to_apply + userRotation) % 360) as Rotation;
  const dataIso = dataBrParaIso(dataTexto);
  const base = nomeBaseDoDestino(destination);
  const fileName = dataIso && base.trim() ? nomeArquivoSadt(base, dataIso) : null;

  // Campo corrigido à mão conta como conferido: confiança 1.
  const avisos = useMemo(
    () =>
      avisosSadt({
        eConsulta: result.e_consulta,
        senha,
        confiancaSenha: senha === result.senha ? result.confidence_senha : 1,
        confiancaData: dataTexto === result.data_autorizacao ? result.confidence_data : 1,
      }),
    [result, senha, dataTexto]
  );

  useEffect(() => {
    if (editingName) {
      const t = setTimeout(() => nameInputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [editingName]);

  const nameConf = confidenceLabel(result.confidence_name);
  const dataConf = confidenceLabel(result.confidence_data);
  const senhaConf = confidenceLabel(result.confidence_senha);
  // Nome é obrigatório mesmo com pasta escolhida à mão: vai como nomeNaGuia, que o servidor exige.
  const canSave = result.error === null && !!fileName && !!dataIso && !!editedName.trim();

  const handleSave = () => {
    if (!fileName || !dataIso) return;
    onSave(alvoDoDestino(destination), fileName, effectiveRotation, {
      paciente: base,
      nomeNaGuia: editedName.trim(),
      data: dataIso,
      senha: senha.trim(),
      // Só dígitos: separador ou texto lido pelo Vision não pode impedir de salvar o PDF.
      carteira: result.carteira.replace(/\D/g, ''),
      codigoProcedimento: result.codigo_procedimento.replace(/\D/g, ''),
    });
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
            Guia SADT · leitura concluída
          </p>
          <p className="font-mono text-[10px] tracking-wide uppercase text-navy/40">
            {(result.elapsedMs / 1000).toFixed(1)}s · {pageCount}p
          </p>
        </div>

        {result.error && <BannerErro mensagem={TEXTO_ERRO[result.error]} />}

        {/* Paciente */}
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
                {editedName || <span className="italic text-navy/30">— não identificada —</span>}
              </h1>
              <PencilIcon />
            </button>
          )}
        </section>

        {/* Consulta: data e senha */}
        <section className="mt-3 rounded-2xl border border-navy/8 bg-bone-50 p-5 shadow-soft">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-navy/40">Consulta</p>

          <label className="mt-3 block">
            <span className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-wider uppercase text-navy/50">Data · campo 4</span>
              {dataTexto === result.data_autorizacao && (
                <ConfidenceBadge tone={dataConf.tone} value={result.confidence_data} />
              )}
            </span>
            <input
              value={dataTexto}
              onChange={(e) => setDataTexto(e.target.value)}
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              maxLength={10}
              className={`mt-2 w-full rounded-xl border bg-bone px-3 py-3 font-mono text-lg text-navy outline-none focus:border-amber ${
                dataIso ? 'border-navy/15' : 'border-danger/60'
              }`}
            />
            {!dataIso && (
              <span className="mt-1 block font-mono text-[10px] tracking-wider uppercase text-danger">
                data inválida
              </span>
            )}
          </label>

          <label className="mt-4 block">
            <span className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-wider uppercase text-navy/50">Senha · campo 5</span>
              {senha === result.senha && (
                <ConfidenceBadge tone={senhaConf.tone} value={result.confidence_senha} />
              )}
            </span>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={20}
              className="mt-2 w-full rounded-xl border border-navy/15 bg-bone px-3 py-3 font-mono text-lg tracking-wider text-navy outline-none focus:border-amber"
            />
          </label>
        </section>

        {avisos.length > 0 && (
          <ul className="mt-3 space-y-2">
            {avisos.map((aviso) => (
              <li
                key={aviso}
                className="rounded-2xl border border-amber/40 bg-amber-50 px-4 py-3 font-serif text-base italic leading-snug text-navy"
              >
                {TEXTO_AVISO[aviso]}
              </li>
            ))}
          </ul>
        )}

        <CartaoDestino
          destination={destination}
          autoMatch={autoMatch}
          manual={manual}
          fileName={fileName}
          onTrocarPasta={() => setShowSearch(true)}
        />

        {firstPageDataUrl && (
          <PreviewOrientacao
            dataUrl={firstPageDataUrl}
            userRotation={userRotation}
            effectiveRotation={effectiveRotation}
            onGirar={() => setUserRotation((prev) => ((prev + 90) % 360) as Rotation)}
          />
        )}
      </div>

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
            Salvar guia <span>→</span>
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
