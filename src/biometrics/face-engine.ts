import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web";

export const FACE_EMBEDDING_MODEL = "opencv-sface-2021dec";
export const FACE_EMBEDDING_SIZE = 128;

export type FaceEngineProgress = {
  stage: string;
  detail: string;
  percent?: number;
};

type FaceEngine = {
  landmarker: FaceLandmarker;
  recognizer: ort.InferenceSession;
};

type ProgressCallback = (progress: FaceEngineProgress) => void;

const faceAssetUrl = (assetPath: string): string =>
  new URL(
    `${import.meta.env.BASE_URL}face-models/${assetPath}`,
    window.location.origin,
  ).toString();

const LANDMARK_MODEL_SHA256 =
  "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const SFACE_SHA256 =
  "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79";
const MODEL_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_ATTEMPTS = 3;

let enginePromise: Promise<FaceEngine> | null = null;

function report(
  onProgress: ProgressCallback | undefined,
  stage: string,
  detail: string,
  percent?: number,
) {
  onProgress?.({ stage, detail, percent });
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buffer),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function fetchVerifiedModel(
  url: string,
  modelName: string,
  expectedSha256: string,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      MODEL_DOWNLOAD_TIMEOUT_MS,
    );

    try {
      report(
        onProgress,
        `Downloading ${modelName}`,
        attempt === 1
          ? "Loading the verified model from CampusFace's own server."
          : `Retrying download (attempt ${attempt} of ${DOWNLOAD_ATTEMPTS}).`,
      );

      const response = await fetch(url, {
        cache: "force-cache",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `CampusFace model file returned HTTP ${response.status}. Reload the app and retry; contact the administrator if it continues.`,
        );
      }
      if (!response.body) {
        throw new Error("The model download returned an empty response.");
      }

      const totalBytes = Number(response.headers.get("content-length")) || undefined;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.byteLength;
          const percent = totalBytes
            ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            : undefined;
          report(
            onProgress,
            `Downloading ${modelName}`,
            totalBytes
              ? `${formatMegabytes(loadedBytes)} of ${formatMegabytes(totalBytes)} downloaded.`
              : `${formatMegabytes(loadedBytes)} downloaded.`,
            percent,
          );
        }
      }

      const bytes = new Uint8Array(loadedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
      if (toHex(digest) !== expectedSha256) {
        throw new Error(
          `The downloaded ${modelName.toLowerCase()} failed its security check. Reload the app and retry.`,
        );
      }

      report(
        onProgress,
        `Preparing ${modelName}`,
        "The model download is complete and its checksum is verified.",
        100,
      );
      return bytes;
    } catch (reason) {
      lastError = reason;
      if (reason instanceof DOMException && reason.name === "AbortError") {
        lastError = new Error(
          `The ${modelName.toLowerCase()} download timed out after 10 minutes. Keep CampusFace open on a stable connection and retry.`,
        );
      }
      if (attempt < DOWNLOAD_ATTEMPTS) {
        report(
          onProgress,
          `Retrying ${modelName}`,
          "A temporary connection problem interrupted the download. CampusFace will retry automatically.",
        );
        await new Promise((resolveDelay) => window.setTimeout(resolveDelay, attempt * 1200));
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  if (lastError instanceof Error) {
    if (lastError.message.startsWith("CampusFace model file returned HTTP")) throw lastError;
    if (lastError.message.includes("failed its security check")) throw lastError;
    if (lastError.message.includes("timed out")) throw lastError;
    if (lastError instanceof TypeError) {
      throw new Error(
        `CampusFace could not reach its local ${modelName.toLowerCase()} file. Check your internet connection, then retry. The model is hosted with the app, not on Hugging Face or a third-party CDN.`,
      );
    }
    throw lastError;
  }

  throw new Error(
    `CampusFace could not download the ${modelName.toLowerCase()}. Check your connection and retry.`,
  );
}

async function createLandmarker(
  onProgress?: ProgressCallback,
): Promise<FaceLandmarker> {
  report(
    onProgress,
    "Loading local face-detection runtime",
    "Preparing the face detector files bundled with CampusFace.",
  );

  let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
  try {
    fileset = await FilesetResolver.forVisionTasks(faceAssetUrl("mediapipe/"));
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    throw new Error(
      `CampusFace could not start its bundled face-detection runtime. ${detail}. Reload the app and retry.`,
    );
  }

  const modelBytes = await fetchVerifiedModel(
    faceAssetUrl("models/face_landmarker.task"),
    "face-detection model",
    LANDMARK_MODEL_SHA256,
    onProgress,
  );

  const commonOptions = {
    runningMode: "VIDEO" as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.65,
    minFacePresenceConfidence: 0.65,
    minTrackingConfidence: 0.65,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  report(
    onProgress,
    "Starting face detector",
    "Initialising the on-device face detector. Keep the app open.",
  );

  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...commonOptions,
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBytes.slice()),
        delegate: "GPU",
      },
    });
  } catch (gpuError) {
    report(
      onProgress,
      "Switching to compatible face detector",
      "This phone is using the CPU fallback for face detection.",
    );
    try {
      return await FaceLandmarker.createFromOptions(fileset, {
        ...commonOptions,
        baseOptions: {
          modelAssetBuffer: new Uint8Array(modelBytes.slice()),
          delegate: "CPU",
        },
      });
    } catch (cpuError) {
      const gpuMessage = gpuError instanceof Error ? gpuError.message : String(gpuError);
      const cpuMessage = cpuError instanceof Error ? cpuError.message : String(cpuError);
      throw new Error(
        `The face-detection model downloaded correctly, but the detector could not start. GPU: ${gpuMessage}. CPU: ${cpuMessage}. Close other apps, reload CampusFace and retry.`,
      );
    }
  }
}

async function loadRecognizer(
  onProgress?: ProgressCallback,
): Promise<ort.InferenceSession> {
  ort.env.wasm.wasmPaths = {
    wasm: faceAssetUrl("onnxruntime/ort-wasm-simd-threaded.wasm"),
    mjs: faceAssetUrl("onnxruntime/ort-wasm-simd-threaded.mjs"),
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const modelBytes = await fetchVerifiedModel(
    faceAssetUrl("models/face_recognition_sface_2021dec.onnx"),
    "face-recognition model",
    SFACE_SHA256,
    onProgress,
  );

  report(
    onProgress,
    "Starting face-recognition runtime",
    "Initialising the on-device recognition engine. This may take a little longer on a phone.",
    100,
  );

  try {
    return await ort.InferenceSession.create(modelBytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      executionMode: "sequential",
      intraOpNumThreads: 1,
    });
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    throw new Error(
      `The face-recognition model downloaded and passed verification, but its local runtime could not start. ${detail}. Close other apps and retry.`,
    );
  }
}

async function loadEngine(onProgress?: ProgressCallback): Promise<FaceEngine> {
  const landmarker = await createLandmarker(onProgress);
  try {
    const recognizer = await loadRecognizer(onProgress);
    report(onProgress, "Face models ready", "Both on-device models are ready for capture.", 100);
    return { landmarker, recognizer };
  } catch (reason) {
    landmarker.close();
    throw reason;
  }
}

/**
 * Prepares the on-device face models before capture. Files are served from the
 * same CampusFace origin and verified before the runtime can use them.
 */
export async function prepareFaceEngine(
  onProgress?: ProgressCallback,
): Promise<void> {
  await getEngine(onProgress);
}

async function getEngine(onProgress?: ProgressCallback): Promise<FaceEngine> {
  if (!enginePromise) {
    enginePromise = loadEngine(onProgress).catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

type Point = { x: number; y: number };

const TARGET_POINTS: Point[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

function fitSimilarityTransform(source: Point[], target: Point[]) {
  const count = source.length;
  const sourceCenter = source.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 },
  );
  const targetCenter = target.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 },
  );

  let denominator = 0;
  let aNumerator = 0;
  let bNumerator = 0;
  for (let i = 0; i < count; i += 1) {
    const sx = source[i].x - sourceCenter.x;
    const sy = source[i].y - sourceCenter.y;
    const tx = target[i].x - targetCenter.x;
    const ty = target[i].y - targetCenter.y;
    denominator += sx * sx + sy * sy;
    aNumerator += sx * tx + sy * ty;
    bNumerator += sx * ty - sy * tx;
  }
  if (denominator < 1) throw new Error("Move closer to the camera and keep your face centered.");

  const a = aNumerator / denominator;
  const b = bNumerator / denominator;
  const e = targetCenter.x - a * sourceCenter.x + b * sourceCenter.y;
  const f = targetCenter.y - b * sourceCenter.x - a * sourceCenter.y;
  return { a, b, e, f };
}

function landmarksToSourcePoints(
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): Point[] {
  if (landmarks.length < 292) throw new Error("The face landmarks could not be read. Try again.");

  const eyes = [landmarks[33], landmarks[263]]
    .map((p) => ({ x: p.x * width, y: p.y * height }))
    .sort((a, b) => a.x - b.x);
  const nose = { x: landmarks[1].x * width, y: landmarks[1].y * height };
  const mouth = [landmarks[61], landmarks[291]]
    .map((p) => ({ x: p.x * width, y: p.y * height }))
    .sort((a, b) => a.x - b.x);

  const eyeDistance = Math.hypot(eyes[1].x - eyes[0].x, eyes[1].y - eyes[0].y);
  if (eyeDistance < Math.min(width, height) * 0.09) {
    throw new Error("The face is too far away. Move the phone a little closer.");
  }
  return [eyes[0], eyes[1], nose, mouth[0], mouth[1]];
}

function alignFace(
  video: HTMLVideoElement,
  landmarks: Array<{ x: number; y: number }>,
): HTMLCanvasElement {
  const points = landmarksToSourcePoints(landmarks, video.videoWidth, video.videoHeight);
  const transform = fitSimilarityTransform(points, TARGET_POINTS);
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 112;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot prepare the face for recognition.");

  context.fillStyle = "#000";
  context.fillRect(0, 0, 112, 112);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.setTransform(transform.a, transform.b, -transform.b, transform.a, transform.e, transform.f);
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function normalizeEmbedding(values: ArrayLike<number>): number[] {
  if (values.length !== FACE_EMBEDDING_SIZE) {
    throw new Error("The recognition model returned an unexpected feature size.");
  }
  const vector = Array.from(values, Number);
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("The recognition model returned invalid values. Capture the face again.");
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude < 1e-8) {
    throw new Error("The face could not be represented reliably. Try again.");
  }
  return vector.map((value) => value / magnitude);
}

/**
 * Produces a 128-value face feature locally on the phone.
 * Camera frames are not returned, persisted, or sent to the server.
 */
export async function extractFaceEmbedding(video: HTMLVideoElement): Promise<number[]> {
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("The camera is not ready yet. Wait for the preview and try again.");
  }

  const engine = await getEngine();
  const result = engine.landmarker.detectForVideo(video, performance.now());
  const faces = result.faceLandmarks ?? [];
  if (faces.length === 0) throw new Error("No face detected. Face the camera and improve the lighting.");
  if (faces.length !== 1) throw new Error("Only one person should be visible during a capture.");

  const aligned = alignFace(video, faces[0]);
  const context = aligned.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The face image could not be prepared.");
  const pixels = context.getImageData(0, 0, 112, 112).data;
  const input = new Float32Array(3 * 112 * 112);
  for (let pixel = 0; pixel < 112 * 112; pixel += 1) {
    input[pixel] = pixels[pixel * 4];
    input[112 * 112 + pixel] = pixels[pixel * 4 + 1];
    input[2 * 112 * 112 + pixel] = pixels[pixel * 4 + 2];
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, 112, 112]);
  const outputName = engine.recognizer.outputNames[0];
  const inference = await engine.recognizer.run({
    [engine.recognizer.inputNames[0]]: tensor,
  });
  const output = inference[outputName];
  if (!output) throw new Error("The recognition model did not return a feature vector.");
  return normalizeEmbedding(output.data as ArrayLike<number>);
}
