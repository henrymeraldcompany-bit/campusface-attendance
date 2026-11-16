import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = process.cwd();
const publicRoot = join(root, "public", "face-models");
const mediaPipeTarget = join(publicRoot, "mediapipe");
const onnxTarget = join(publicRoot, "onnxruntime");
const modelsTarget = join(publicRoot, "models");
const require = createRequire(import.meta.url);

const ASSETS = [
  {
    name: "MediaPipe face landmark model",
    file: "face_landmarker.task",
    expectedBytes: 3_000_000,
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
    urls: [
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    ],
  },
  {
    name: "OpenCV SFace recognition model",
    file: "face_recognition_sface_2021dec.onnx",
    expectedBytes: 30_000_000,
    sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    urls: [
      "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
      "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
      "https://mirrors.xtom.nl/kde-application/digikam/facesengine/dnnface/face_recognition_sface_2021dec.onnx",
    ],
  },
];

function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

async function downloadAsset(asset) {
  const destination = join(modelsTarget, asset.file);
  if (existsSync(destination) &&
      statSync(destination).size >= asset.expectedBytes &&
      hashFile(destination) === asset.sha256) {
    console.log(`Verified cached build asset: ${asset.name}`);
    return { file: asset.file, bytes: statSync(destination).size, sha256: asset.sha256 };
  }

  const failures = [];
  for (const url of asset.urls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const temporary = destination + ".partial";
      rmSync(temporary, { force: true });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12 * 60 * 1000);
      try {
        console.log(`Downloading ${asset.name} (attempt ${attempt}/3)...`);
        const response = await fetch(url, {
          redirect: "follow",
          cache: "no-store",
          signal: controller.signal,
          headers: { "user-agent": "CampusFace-build/1.0" },
        });
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
        }
        await pipeline(
          Readable.fromWeb(response.body),
          createWriteStream(temporary),
          { signal: controller.signal },
        );

        const bytes = statSync(temporary).size;
        if (bytes < asset.expectedBytes) {
          throw new Error(`Download was incomplete (${bytes} bytes)`);
        }
        const actualHash = hashFile(temporary);
        if (actualHash !== asset.sha256) {
          throw new Error(`SHA-256 verification failed: ${actualHash}`);
        }
        renameSync(temporary, destination);
        console.log(`Verified ${asset.name}: ${bytes.toLocaleString()} bytes`);
        return { file: asset.file, bytes, sha256: actualHash };
      } catch (error) {
        failures.push(`${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
        console.warn(`Download attempt failed for ${asset.name}: ${failures.at(-1)}`);
        rmSync(temporary, { force: true });
        if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1500));
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  throw new Error(`Could not prepare ${asset.name}. ${failures.join(" | ")}`);
}

function copyRuntimeFiles(packageName, entry, target, matcher, required) {
  const packageEntry = require.resolve(entry || packageName);
  const packageDirectory = entry
    ? resolve(dirname(packageEntry), "..")
    : dirname(packageEntry);
  const sourceDirectory = packageName === "@mediapipe/tasks-vision"
    ? join(packageDirectory, "wasm")
    : packageDirectory;
  if (!existsSync(sourceDirectory)) {
    throw new Error(`Required runtime directory is missing: ${sourceDirectory}`);
  }
  mkdirSync(target, { recursive: true });
  const copied = readdirSync(sourceDirectory).filter((file) => matcher.test(file));
  for (const file of copied) {
    copyFileSync(join(sourceDirectory, file), join(target, file));
  }
  for (const file of required) {
    if (!existsSync(join(target, file))) {
      throw new Error(`Required runtime file ${file} was not found in ${sourceDirectory}`);
    }
  }
  console.log(`Prepared ${packageName} runtime: ${copied.join(", ")}`);
}

async function main() {
  mkdirSync(mediaPipeTarget, { recursive: true });
  mkdirSync(onnxTarget, { recursive: true });
  mkdirSync(modelsTarget, { recursive: true });

  copyRuntimeFiles(
    "@mediapipe/tasks-vision",
    "@mediapipe/tasks-vision/vision_bundle.mjs",
    mediaPipeTarget,
    /^vision_wasm.*\\.(?:js|wasm)$/,
    ["vision_wasm_internal.js", "vision_wasm_internal.wasm"],
  );
  copyRuntimeFiles(
    "onnxruntime-web",
    null,
    onnxTarget,
    /^ort-wasm-simd-threaded\\.(?:mjs|wasm)$/,
    ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"],
  );

  const downloads = [];
  for (const asset of ASSETS) downloads.push(await downloadAsset(asset));
  writeFileSync(
    join(publicRoot, "asset-manifest.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      assets: downloads,
    }, null, 2),
  );
  console.log("All face-model runtime files and model weights are ready for the production build.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
