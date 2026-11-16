import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web";

export const FACE_EMBEDDING_MODEL = "opencv-sface-2021dec";
export const FACE_EMBEDDING_SIZE = 128;

const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const LANDMARK_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SFACE_MODEL =
  "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx";
const SFACE_SHA256 =
  "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79";

type FaceEngine = {
  landmarker: FaceLandmarker;
  recognizer: ort.InferenceSession;
};

let enginePromise: Promise<FaceEngine> | null = null;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadRecognizer(): Promise<ort.InferenceSession> {
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const response = await fetch(SFACE_MODEL, { cache: "force-cache" });
  if (!response.ok) throw new Error("The recognition model could not be downloaded. Check your internet connection.");
  const modelBytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", modelBytes);
  if (toHex(digest) !== SFACE_SHA256) {
    throw new Error("The downloaded recognition model failed its integrity check.");
  }

  return ort.InferenceSession.create(modelBytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    executionMode: "sequential",
    intraOpNumThreads: 1,
  });
}

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: LANDMARK_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      minFaceDetectionConfidence: 0.65,
      minFacePresenceConfidence: 0.65,
      minTrackingConfidence: 0.65,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  } catch {
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: LANDMARK_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      minFaceDetectionConfidence: 0.65,
      minFacePresenceConfidence: 0.65,
      minTrackingConfidence: 0.65,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }
}

async function getEngine(): Promise<FaceEngine> {
  if (!enginePromise) {
    enginePromise = Promise.all([createLandmarker(), loadRecognizer()])
      .then(([landmarker, recognizer]) => ({ landmarker, recognizer }))
      .catch((error) => {
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
