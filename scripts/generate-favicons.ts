import sharp from "sharp";
import { mkdir } from "node:fs/promises";

async function main() {
  const source = "public/logo.jpg";
  const meta = await sharp(source).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.min(width, Math.round(height * 0.62));
  const left = Math.max(0, Math.round((width - size) / 2));

  await mkdir("public", { recursive: true });
  const cropped = sharp(source).extract({ left, top: 0, width: size, height: size });

  await cropped.clone().resize(32, 32).png().toFile("public/favicon-32.png");
  await cropped.clone().resize(180, 180).png().toFile("public/apple-touch-icon.png");
  await cropped.clone().resize(512, 512).png().toFile("public/icon-512.png");
}

main();
