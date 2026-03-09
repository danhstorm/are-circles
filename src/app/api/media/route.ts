import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
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
