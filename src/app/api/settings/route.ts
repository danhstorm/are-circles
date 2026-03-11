import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SETTINGS_PATH = path.join(process.cwd(), 'public', 'settings.json');

function computeHash(obj: Record<string, unknown>): string {
  const content = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }
  try {
    const body = await req.json();
    // Migrate livePresets -> scenes if needed
    if (body.livePresets && !body.scenes) {
      body.scenes = body.livePresets;
      delete body.livePresets;
    }
    // Compute content hash as version
    const rest = { ...body };
    delete rest.version;
    const version = computeHash(rest);
    const data = { ...body, version };
    delete data.livePresets;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, version });
  } catch {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
