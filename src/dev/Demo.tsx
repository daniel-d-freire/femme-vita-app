// src/dev/Demo.tsx — vitrine só de desenvolvimento. main.tsx não carrega isto em produção.
import { CameraScreen } from '../components/CameraScreen';
import { SadtResultScreen } from '../components/SadtResultScreen';
import { SavedScreen } from '../components/SavedScreen';
import type { SadtAnalyzeResult } from '../lib/api';

const PAGINA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#fff"/><text x="80" y="110" font-size="44" font-family="Arial" font-weight="bold">GUIA SP/SADT (exemplo)</text><rect x="80" y="160" width="1240" height="700" fill="none" stroke="#999"/></svg>'
  );

const RESULTADO: SadtAnalyzeResult = {
  e_guia_sadt: true,
  patient_name: 'MARIA DE TESTE LIMA',
  data_autorizacao: '30/09/2026',
  senha: '10000000001',
  carteira: '2000000000001',
  codigo_procedimento: '98250159',
  e_consulta: true,
  confidence_name: 0.98,
  confidence_data: 0.97,
  confidence_senha: 0.97,
  error: null,
  rotation_to_apply: 0,
  elapsedMs: 4200,
};

const PASTAS = [
  { id: 'p1', name: 'MARIA DE TESTE LIMA' },
  { id: 'p2', name: 'Ana Exemplo Souza' },
];

const nada = () => undefined;
const salvar = (...args: unknown[]) => console.log('[demo] salvar', args);

export default function Demo({ nome }: { nome: string }) {
  switch (nome) {
    case 'sadt-resultado':
      return <SadtResultScreen result={RESULTADO} pageCount={1} firstPageDataUrl={PAGINA} folders={PASTAS} onSave={salvar} onBackToReview={nada} />;
    case 'sadt-avisos':
      return (
        <SadtResultScreen
          result={{ ...RESULTADO, patient_name: 'PACIENTE SEM PASTA', codigo_procedimento: '40901300', e_consulta: false, confidence_senha: 0.6, confidence_data: 0.7 }}
          pageCount={1}
          firstPageDataUrl={PAGINA}
          folders={PASTAS}
          onSave={salvar}
          onBackToReview={nada}
        />
      );
    case 'sadt-nao-sadt':
      return (
        <SadtResultScreen
          result={{ ...RESULTADO, e_guia_sadt: false, error: 'not_recognized' }}
          pageCount={1}
          firstPageDataUrl={PAGINA}
          folders={PASTAS}
          onSave={salvar}
          onBackToReview={nada}
        />
      );
    case 'sadt-camera':
      return (
        <CameraScreen
          pages={[]}
          onCapture={nada}
          onReview={nada}
          user={{ email: 'recepcao@exemplo.com', name: 'Recepção' }}
          folderCount={2281}
          onLogout={nada}
          modo="sadt"
          salvasNaSessao={3}
          ultimoSalvo={{ nome: 'Guia_SADT_MARIA DE TESTE LIMA_2026.09.30.pdf', n: 3 }}
        />
      );
    case 'sadt-salvo':
      return (
        <SavedScreen
          modo="sadt"
          onNewDocument={nada}
          result={{
            ok: true,
            fileId: 'f1',
            fileName: 'Guia_SADT_MARIA DE TESTE LIMA_2026.09.30_2.pdf',
            folderId: 'p1',
            folderName: 'MARIA DE TESTE LIMA',
            wasPendente: false,
            renomeado: true,
            registroFalhou: true,
            sizeKb: 412,
            timing: { pdfMs: 300, uploadMs: 900, totalMs: 1200 },
          }}
        />
      );
    default:
      return (
        <p style={{ padding: 24, fontFamily: 'monospace' }}>
          Demos: sadt-resultado, sadt-avisos, sadt-nao-sadt, sadt-camera, sadt-salvo
        </p>
      );
  }
}
