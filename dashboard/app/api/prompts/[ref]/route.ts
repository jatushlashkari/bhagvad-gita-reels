import { getBackend } from '../../../../lib/backend.ts';
import { REF_PATTERN } from '../../../../../shared/custom-quotes.ts';

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref: rawRef } = await params;
  const ref = decodeURIComponent(rawRef);
  if (!REF_PATTERN.test(ref)) return Response.json({ error: 'invalid ref' }, { status: 400 });
  const curated = await getBackend().getCuratedPrompt(ref);
  return Response.json({ curated });
}
