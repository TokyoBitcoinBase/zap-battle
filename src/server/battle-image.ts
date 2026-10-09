import sharp from "sharp";

export async function optimizeBattleImage(bytes: Buffer): Promise<Buffer> {
  const source = sharp(bytes, { limitInputPixels: 24_000_000, animated: false });
  const metadata = await source.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new Error("Unsupported image format");
  return source.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}
