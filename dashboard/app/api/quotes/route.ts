import { getBackend } from '../../../lib/backend.ts';

export async function GET() {
  return Response.json(await getBackend().listQuotes());
}
