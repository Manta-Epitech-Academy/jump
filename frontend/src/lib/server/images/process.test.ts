import { describe, it, expect } from 'vitest';
import { readGifSize, sniffImageType } from './process';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

describe('sniffImageType', () => {
  it('names each accepted type by its magic bytes', () => {
    expect(sniffImageType(bytes('GIF89a', [1, 0, 1, 0]))).toBe('gif');
    expect(sniffImageType(bytes('GIF87a'))).toBe('gif');
    expect(
      sniffImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('png');
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImageType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe(
      'webp',
    );
  });

  it('refuses anything else, however it was named', () => {
    expect(
      sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBe(null);
    expect(sniffImageType(bytes('<!doctype html>'))).toBe(null);
    expect(sniffImageType(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBe(null);
    expect(sniffImageType(new Uint8Array())).toBe(null);
  });
});

describe('readGifSize', () => {
  it('reads the canvas size from the header', () => {
    // 640 x 360, little-endian.
    expect(readGifSize(bytes('GIF89a', [0x80, 0x02, 0x68, 0x01]))).toEqual({
      width: 640,
      height: 360,
    });
  });

  it('answers null for a truncated header, an empty canvas or another type', () => {
    expect(readGifSize(bytes('GIF89a', [0x80]))).toBe(null);
    expect(readGifSize(bytes('GIF89a', [0, 0, 0, 0]))).toBe(null);
    expect(readGifSize(bytes([0xff, 0xd8, 0xff, 0, 0, 0, 1, 0, 1, 0]))).toBe(
      null,
    );
  });
});
