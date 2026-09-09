import { getBackend } from '../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../lib/assert-local-origin.ts';
import { CUSTOM_ID } from '../../../../../shared/custom-quotes.ts';

// 'not found' (the exact message both updateCustomQuote and deleteCustomQuote throw for an
// unknown id) maps to 404; every other validation throw from validateCustomQuote is a 400.
function statusFor(e: unknown): number {
  return e instanceof Error && /not found/.test(e.message) ? 404 : 400;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  if (!CUSTOM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const quote = await getBackend().updateCustomQuote(id, body);
    return Response.json(quote);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid custom quote' }, { status: statusFor(e) });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  if (!CUSTOM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  try {
    await getBackend().deleteCustomQuote(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: statusFor(e) });
  }
}
