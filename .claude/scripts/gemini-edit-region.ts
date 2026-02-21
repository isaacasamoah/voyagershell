#!/usr/bin/env npx tsx

/**
 * Surgical image editing via crop-and-recombine.
 *
 * Extracts a region, sends it to Gemini for editing,
 * then composites the result back at exact coordinates.
 *
 * Usage:
 *   npx tsx .claude/scripts/gemini-edit-region.ts \
 *     --input astronaut.png \
 *     --region "80,340,180,120" \
 *     --prompt "Remove grey fill, pure white linework only" \
 *     --output astronaut-fixed.png
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();

interface Args {
  input: string;
  region: { left: number; top: number; width: number; height: number };
  prompt: string;
  output: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let input = "";
  let regionStr = "";
  let prompt = "";
  let output = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input":
      case "-i":
        input = args[++i];
        break;
      case "--region":
      case "-r":
        regionStr = args[++i];
        break;
      case "--prompt":
      case "-p":
        prompt = args[++i];
        break;
      case "--output":
      case "-o":
        output = args[++i];
        break;
    }
  }

  if (!input || !regionStr || !prompt) {
    console.error(
      'Usage: gemini-edit-region.ts --input file.png --region "left,top,width,height" --prompt "edit instruction" [--output out.png]'
    );
    process.exit(1);
  }

  const [left, top, width, height] = regionStr.split(",").map(Number);
  if ([left, top, width, height].some(isNaN)) {
    console.error("Region must be four comma-separated numbers: left,top,width,height");
    process.exit(1);
  }

  return {
    input,
    region: { left, top, width, height },
    prompt,
    output: output || input.replace(/(\.\w+)$/, "-edited$1"),
  };
}

async function editRegionWithGemini(crop: Buffer, prompt: string): Promise<Buffer> {
  const apiKey = requireEnv("GOOGLE_GEMINI_API_KEY");
  const model = "gemini-3-pro-image-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: crop.toString("base64"),
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["image", "text"],
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  const text = parts.find((p: { text?: string }) => p.text)?.text;
  throw new Error("No image in Gemini response. " + (text || ""));
}

async function main(): Promise<void> {
  const { input, region, prompt, output } = parseArgs();

  if (!fs.existsSync(input)) {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  }

  console.log(`Input:  ${input}`);
  console.log(`Region: left=${region.left} top=${region.top} ${region.width}x${region.height}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Output: ${output}`);
  console.log("");

  // 1. Load original and extract region
  console.log("Extracting region...");
  const original = sharp(input);
  const cropBuffer = await original
    .clone()
    .extract(region)
    .png()
    .toBuffer();

  // Save crop for inspection
  const cropPath = output.replace(/(\.\w+)$/, "-crop$1");
  await sharp(cropBuffer).toFile(cropPath);
  console.log(`  Crop saved: ${cropPath}`);

  // 2. Send crop to Gemini for editing
  console.log("Sending to Gemini...");
  const editedCrop = await editRegionWithGemini(cropBuffer, prompt);

  // Save edited crop for inspection
  const editedCropPath = output.replace(/(\.\w+)$/, "-crop-edited$1");
  await sharp(editedCrop).toFile(editedCropPath);
  console.log(`  Edited crop saved: ${editedCropPath}`);

  // 3. Resize edited crop to match original region dimensions
  console.log("Resizing edited crop to match region...");
  const resizedCrop = await sharp(editedCrop)
    .resize(region.width, region.height, { fit: "fill" })
    .png()
    .toBuffer();

  // 4. Composite back onto original
  console.log("Compositing...");
  const metadata = await sharp(input).metadata();
  const originalBuffer = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer();

  await sharp(originalBuffer, {
    raw: {
      width: metadata.width!,
      height: metadata.height!,
      channels: 4,
    },
  })
    .composite([
      {
        input: resizedCrop,
        left: region.left,
        top: region.top,
      },
    ])
    .png()
    .toFile(output);

  console.log(`\nDone: ${output}`);

  // Cleanup intermediate files
  const keepIntermediates = process.env.KEEP_INTERMEDIATES === "1";
  if (!keepIntermediates) {
    fs.unlinkSync(cropPath);
    fs.unlinkSync(editedCropPath);
    console.log("Cleaned up intermediate files. Set KEEP_INTERMEDIATES=1 to keep them.");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
