import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');

const EXT_MAP: Record<string, 'image' | 'video' | 'gif'> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'gif',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
};

export async function GET() {
  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      return NextResponse.json([]);
    }
    const files = fs.readdirSync(MEDIA_DIR);
    const items = files
      .filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ext in EXT_MAP;
      })
      .map((f) => ({
        src: `/media/${f}`,
        type: EXT_MAP[path.extname(f).toLowerCase()],
      }));
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
