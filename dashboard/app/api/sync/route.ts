import { getBackend } from '../../../lib/backend.ts';

export async function POST() {
  return Response.json(await getBackend().sync());
}
