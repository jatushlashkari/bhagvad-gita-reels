export function pickAsset(ref: string, files: string[]): string {
  if (files.length === 0) throw new Error('asset list is empty');
  let h = 0x811c9dc5;
  for (const c of ref) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [...files].sort()[h % files.length];
}
