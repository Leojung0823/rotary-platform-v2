import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "public", "icons");
const appIcon = await readFile(path.join(repositoryRoot, "public", "icon.svg"));
const maskableIcon = await readFile(path.join(outputDirectory, "icon-maskable.svg"));

await mkdir(outputDirectory, { recursive: true });

async function render(source, name, size) {
  await sharp(source, { density: 512 })
    .resize(size, size, { fit: "contain", background: "#0d6eaa" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, name));
}

await Promise.all([
  render(appIcon, "icon-192.png", 192),
  render(appIcon, "icon-512.png", 512),
  render(maskableIcon, "icon-maskable-512.png", 512),
  render(appIcon, "apple-touch-icon.png", 180),
]);

console.log("Generated 192px, 512px, maskable 512px, and Apple 180px icons.");
