import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SETTINGS_PATH = path.join(process.cwd(), 'public', 'settings.json');

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }
  try {
    const body = await req.json();
    // Increment version
    const version = String(parseInt(body.version || '0') + 1);
    const data = { ...body, version };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, version });
  } catch {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
