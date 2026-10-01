// src/lib/useDestino.ts
import { useMemo, useState } from 'react';
import { matchFolder, type Folder, type FolderMatch } from './folder-match';
import type { UploadTarget } from './api';

/** Escolha manual pela busca de pastas: uma pasta ou um nome novo em _Pendentes. */
export type Manual = { kind: 'folder'; folder: Folder } | { kind: 'pendente'; name: string };
export type Destino = Manual;

export function alvoDoDestino(destino: Destino): UploadTarget {
  return destino.kind === 'folder'
    ? { kind: 'folderId', folderId: destino.folder.id }
    : { kind: 'pendente', patientName: destino.name };
}

/** Com pasta casada usa o nome canônico dela, para os arquivos da paciente ficarem iguais. */
export function nomeBaseDoDestino(destino: Destino): string {
  return destino.kind === 'folder' ? destino.folder.name : destino.name;
}

/** Destino resolvido: escolha manual vence o casamento automático, que vence _Pendentes. */
export function useDestino(nome: string, folders: Folder[]) {
  const [manual, setManual] = useState<Manual | null>(null);
  const autoMatch = useMemo<FolderMatch | null>(
    () => (nome ? matchFolder(nome, folders) : null),
    [nome, folders]
  );
  const destination = useMemo<Destino>(() => {
    if (manual) return manual;
    if (autoMatch) return { kind: 'folder', folder: autoMatch.folder };
    return { kind: 'pendente', name: nome };
  }, [manual, autoMatch, nome]);
  return { destination, autoMatch, manual, setManual };
}
