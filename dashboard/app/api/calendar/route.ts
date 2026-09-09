import { getBackend } from '../../../lib/backend.ts';

// 500, not a soft empty calendar: getCalendar only throws when schedule.json itself is unreadable
// or malformed, and that file is the record of what has already been published. Answering "nothing
// scheduled" would hide a broken calendar behind a plausible-looking empty table, so the message
// readSchedule threw is passed through verbatim for whoever has to fix the file.
export async function GET() {
  try {
    return Response.json(await getBackend().getCalendar());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'calendar unreadable' }, { status: 500 });
  }
}
