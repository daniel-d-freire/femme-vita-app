// src/dev/Demo.tsx — vitrine só de desenvolvimento. main.tsx não carrega isto em produção.
import { CameraScreen } from '../components/CameraScreen';
import { PainelAnexosScreen } from '../components/PainelAnexosScreen';
import { PainelSadtScreen } from '../components/PainelSadtScreen';
import { SadtResultScreen } from '../components/SadtResultScreen';
import { SavedScreen } from '../components/SavedScreen';
import type { SadtAnalyzeResult } from '../lib/api';
import type { PainelAnexos } from '../lib/anexos';
import type { PainelSadt } from '../lib/painel';

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

const PAINEL: PainelSadt = {
  mes: '2026-09',
  guias: [
    { chave: 'a.json', paciente: 'MARIA DE TESTE LIMA', data: '2026-09-02', status: 'faturada', guiaPortal: '3320311', valor: 82.02, motivo: null, pdfId: 'p1', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'b.json', paciente: 'Ana Exemplo Souza', data: '2026-09-02', status: 'faturada', guiaPortal: '3320312', valor: 82.02, motivo: null, pdfId: 'p2', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'c.json', paciente: 'Beatriz Modelo Costa', data: '2026-09-09', status: 'pendencia', guiaPortal: null, valor: null, motivo: 'Trava 1: o portal carregou "BEATRIZ OUTRA", a guia diz "BEATRIZ MODELO COSTA"', pdfId: 'p3', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'd.json', paciente: 'Carla Demonstração Reis', data: '2026-09-15', status: 'falta_faturar', guiaPortal: null, valor: null, motivo: null, pdfId: 'p4', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'e.json', paciente: 'Diana Fictícia Lopes', data: '2026-09-21', status: 'conferir', guiaPortal: '3320330', valor: 82.02, motivo: 'guia 3320330 ficou sem confirmação de finalização; confira no portal antes de rodar de novo', pdfId: 'p5', digitalizadoPor: 'recepcao@exemplo.com' },
    { chave: 'f.json', paciente: 'Elisa Amostra Prado', data: '2026-09-30', status: 'duplicada', guiaPortal: null, valor: null, motivo: 'mesma senha de a.json', pdfId: 'p6', digitalizadoPor: 'recepcao@exemplo.com' },
  ],
  pdfsSemRegistro: [{ id: 'p9', nome: 'Guia_SADT_Fabiana Teste_2026.09.18.pdf', link: 'https://drive.google.com' }],
  ultimaExecucao: { inicio: '2026-10-03T13:00:00.000Z', fim: '2026-10-03T13:06:00.000Z', dryRun: false, resumo: '2 faturadas, 1 pendência, 1 para conferir no portal' },
  avisoLivro: null,
  agenda: {
    disponivel: true,
    atendidas: 8,
    digitalizadas: 6,
    faturadas: 2,
    semGuia: [{ paciente: 'Gabriela Inventada Rocha', data: '2026-09-03', servico: 'Retorno Histeroscopia' }],
    semBaixa: [{ paciente: 'Helena Exemplo Dias', data: '2026-09-29', servico: 'Consulta rotina', status: 'confirmada' }],
    guiaSemAtendimento: [],
    convenioErrado: [{ paciente: 'Carla Demonstração Reis', data: '2026-09-15', convenio: null }],
    dataDiferente: [{ chave: 'c.json', dataAgenda: '2026-09-08' }],
  },
  totais: { digitalizadas: 6, faturadas: 2, valorFaturado: 164.04, faltaFaturar: 1, atencao: 3, duplicadas: 1 },
};

const nada = () => undefined;
const salvar = (...args: unknown[]) => console.log('[demo] salvar', args);

const PAINEL_ANEXOS: PainelAnexos = {
  mes: '2026-11',
  referencia: '11/2026',
  aviso: null,
  ultimaExecucao: { inicio: '2026-11-05T13:00:00.000Z', fim: '2026-11-05T13:20:00.000Z', dryRun: false, resumo: '3 anexadas, 1 pendências, 1 a conferir, 0 já anexadas antes' },
  totais: { total: 6, anexadas: 3, pendencias: 1, conferir: 1, naoEnviadas: 1 },
  contas: [
    { conta: '18000001', nr: '150000000', tipo: 'sadt', paciente: 'MARIA DE TESTE LIMA', status: 'conferir', arquivos: ['Guia_SADT_MARIA DE TESTE LIMA_2026.10.02.pdf'], motivo: null, em: '2026-11-05T13:05:00.000Z', nota: null },
    { conta: '18000002', nr: '140000000', tipo: 'honorarios', paciente: 'ANA EXEMPLO SOUZA', status: 'pendencia', arquivos: [], motivo: 'falta guia de honorários assinada', em: '2026-11-05T13:06:00.000Z', nota: null },
    { conta: '18000003', nr: '150000000', tipo: 'sadt', paciente: 'BIA TESTE COSTA', status: 'nao_enviada', arquivos: [], motivo: null, em: '2026-11-05T13:00:00.000Z', nota: null },
    { conta: '18000004', nr: '140000000', tipo: 'honorarios', paciente: 'CIDA FICTICIA ROCHA', status: 'anexada', arquivos: ['Guia_internação_CIDA FICTICIA ROCHA.pdf', 'Descrição_cirúrgica_CIDA FICTICIA ROCHA.pdf', 'Guia_honorários_assinada_CIDA FICTICIA ROCHA.pdf'], motivo: null, em: '2026-11-05T13:10:00.000Z', nota: null },
    { conta: '18000005', nr: '150000000', tipo: 'sadt', paciente: 'DORA EXEMPLO DIAS', status: 'anexada', arquivos: ['Guia_SADT_DORA EXEMPLO DIAS_2026.10.15.pdf'], motivo: null, em: '2026-11-05T13:12:00.000Z', nota: 'anexada à mão em 03/10/2026, antes do robô' },
    { conta: '18000006', nr: '150000000', tipo: 'sadt', paciente: 'EVA TESTE MOURA', status: 'anexada', arquivos: ['Guia_SADT_EVA TESTE MOURA_2026.10.20.pdf'], motivo: null, em: '2026-11-05T13:14:00.000Z', nota: null },
  ],
};

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
    case 'painel-sadt':
      return <PainelSadtScreen mesInicial="2026-09" carregar={async () => PAINEL} />;
    case 'painel-sadt-vazio':
      return (
        <PainelSadtScreen
          mesInicial="2026-08"
          carregar={async (mes) => ({ ...PAINEL, mes, guias: [], pdfsSemRegistro: [], ultimaExecucao: null, totais: { digitalizadas: 0, faturadas: 0, valorFaturado: 0, faltaFaturar: 0, atencao: 0, duplicadas: 0 }, agenda: { disponivel: false, motivo: 'token do NinSaúde não configurado' } })}
        />
      );
    case 'painel-sadt-completo':
      return (
        <PainelSadtScreen
          mesInicial="2026-09"
          carregar={async () => ({
            ...PAINEL,
            agenda: { disponivel: true, atendidas: 6, digitalizadas: 6, faturadas: 6, semGuia: [], semBaixa: [], guiaSemAtendimento: [], convenioErrado: [], dataDiferente: [] },
          })}
        />
      );
    case 'painel-anexos':
      return <PainelAnexosScreen mesInicial="2026-11" carregar={async () => PAINEL_ANEXOS} />;
    case 'painel-anexos-vazio':
      return (
        <PainelAnexosScreen
          mesInicial="2026-12"
          carregar={async (mes) => ({ ...PAINEL_ANEXOS, mes, referencia: `${mes.slice(5, 7)}/${mes.slice(0, 4)}`, contas: [], ultimaExecucao: null, totais: { total: 0, anexadas: 0, pendencias: 0, conferir: 0, naoEnviadas: 0 } })}
        />
      );
    case 'painel-anexos-aviso':
      return (
        <PainelAnexosScreen
          mesInicial="2026-11"
          carregar={async () => ({ ...PAINEL_ANEXOS, contas: [], totais: { total: 0, anexadas: 0, pendencias: 0, conferir: 0, naoEnviadas: 0 }, aviso: 'O registro deste mês não abriu ou está fora do formato. Não rode o robô antes de conferir o arquivo _anexos.json (avise o Daniel).' })}
        />
      );
    default:
      return (
        <p style={{ padding: 24, fontFamily: 'monospace' }}>
          Demos: sadt-resultado, sadt-avisos, sadt-nao-sadt, sadt-camera, sadt-salvo, painel-sadt, painel-sadt-completo, painel-sadt-vazio, painel-anexos, painel-anexos-vazio, painel-anexos-aviso
        </p>
      );
  }
}
