import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
const THUMBS_DIR = path.join(MEDIA_DIR, 'thumbs');
const SUPPORTED_EXT = new Set(['.mp4', '.webm', '.mov']);

export async function GET() {
  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      return NextResponse.json([]);
    }
    const files = fs.readdirSync(MEDIA_DIR).filter(f => !fs.statSync(path.join(MEDIA_DIR, f)).isDirectory());
    const items = files
      .filter((f) => SUPPORTED_EXT.has(path.extname(f).toLowerCase()))
      .map((f) => ({
        src: `/media/${f}`,
        type: 'video' as const,
        playMode: 'loop' as const,
        invert: false,
      }));
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { src } = await req.json();
    if (typeof src !== 'string' || !src.startsWith('/media/')) {
      return NextResponse.json({ error: 'Invalid src' }, { status: 400 });
    }
    const filename = path.basename(src);
    const filePath = path.join(MEDIA_DIR, filename);
    const thumbName = filename.replace(/\.[^.]+$/, '.jpg');
    const thumbPath = path.join(THUMBS_DIR, thumbName);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
