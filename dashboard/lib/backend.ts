import { localBackend } from './local-backend.ts';

export type AssetInfo = { file: string; rel: string; kind: 'clip' | 'image'; license: string };
export type StateSummary = {
  lastPosted: { ref: string; youtube?: string; instagram?: string } | null;
  nextRef: string | null;
  totalPosted: number;
  chapters: number[];
};

export interface Backend {
  repoRoot(): string;
  listAssets(): Promise<AssetInfo[]>;
  saveImage(name: string, data: Buffer): Promise<AssetInfo>;
  getState(): Promise<StateSummary>;
  getVerse(ref: string): Promise<{ sanskrit: string[]; hindi: string; english: string } | null>;
  sync(): Promise<{ ok: boolean; output: string }>;
}

export function getBackend(): Backend {
  return localBackend;
}
