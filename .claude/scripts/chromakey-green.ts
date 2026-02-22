#!/usr/bin/env npx tsx

/**
 * Remove bright green (#00FF00) chromakey background from images.
 * Preserves all non-green pixels including white suit areas.
 * Smooth alpha transition at edges to avoid harsh cutouts.
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const INPUT_DIR = path.join(process.cwd(), "generated-images/stretch-green");
const OUTPUT_DIR = path.join(process.cwd(), "public/images/astronaut/stretch-frames");

// Green channel threshold — pixels where G is dominant and R/B are low
const GREEN_THRESHOLD = 200;  // G channel must be above this
const NON_GREEN_MAX = 100;    // R and B must be below this for "pure green"
const EDGE_BLEND = 40;        // Range for anti-aliased edge blending

async function removeGreenBackground(inputPath: string, outputPath: string): Promise<void> {
  const filename = path.basename(inputPath);
  console.log(`Processing ${filename}...`);

  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Calculate "greenness" — how much green dominates over red and blue
    const greenDominance = g - Math.max(r, b);

    if (g >= GREEN_THRESHOLD && r <= NON_GREEN_MAX && b <= NON_GREEN_MAX) {
      // Pure green background — fully transparent
      pixels[i + 3] = 0;
    } else if (greenDominance > EDGE_BLEND) {
      // Anti-aliased edge — partial transparency based on green dominance
      // More green dominant = more transparent
      const maxDominance = GREEN_THRESHOLD - NON_GREEN_MAX;
      const alpha = Math.round(255 * (1 - (greenDominance - EDGE_BLEND) / (maxDominance - EDGE_BLEND)));
      pixels[i + 3] = Math.max(0, Math.min(255, alpha));
    }
    // Everything else stays fully opaque (white suit, black lines, etc.)
  }

  await sharp(Buffer.from(pixels), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`  ✓ ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(0)}KB)`);
}

async function main(): Promise<void> {
  console.log("\nChromakey green → transparent\n");
  console.log("─".repeat(50));

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.png'));

  for (const file of files) {
    await removeGreenBackground(
      path.join(INPUT_DIR, file),
      path.join(OUTPUT_DIR, file)
    );
  }

  console.log("─".repeat(50));
  console.log(`\n✅ Done! ${files.length} frames processed.\n`);
}

main().catch(console.error);
