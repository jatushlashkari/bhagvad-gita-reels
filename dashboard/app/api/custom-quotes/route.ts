import { getBackend } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

export async function GET() {
  return Response.json(await getBackend().listCustomQuotes());
}

export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const quote = await getBackend().createCustomQuote(body);
    return Response.json(quote, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid custom quote' }, { status: 400 });
  }
}
