import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, RefreshCw, ScanFace, ShieldCheck } from "lucide-react";
import {
  extractFaceEmbedding,
  prepareFaceEngine,
  type FaceEngineProgress,
} from "./face-engine";
import "./face-camera.css";

type Props = {
  title: string;
  description: string;
  actionLabel: string;
  disabled?: boolean;
  onCapture: (embedding: number[]) => Promise<void> | void;
};

export function FaceCameraCapture({
  title,
  description,
  actionLabel,
  disabled = false,
  onCapture,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState<FaceEngineProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const prepareModels = (): Promise<void> => {
    if (modelReady) return Promise.resolve();
    if (preparePromiseRef.current) return preparePromiseRef.current;

    setModelLoading(true);
    setError("");
    setModelProgress({
      stage: "Preparing local face models",
      detail: "Checking the bundled model files.",
    });

    const preparation = (async () => {
      try {
        await prepareFaceEngine((progress) => setModelProgress(progress));
        setModelReady(true);
        setNotice("Face models are ready. You can now capture.");
      } catch (reason) {
        setModelReady(false);
        setError(reason instanceof Error
          ? reason.message
          : "CampusFace could not prepare the face models. Check your connection and try again.");
      } finally {
        setModelLoading(false);
        preparePromiseRef.current = null;
      }
    })();

    preparePromiseRef.current = preparation;
    return preparation;
  };

  const startCamera = async () => {
    if (starting || cameraActive || disabled) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires a supported browser and a secure HTTPS connection.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);

      // Models are served by this app, so the first setup is reliable and
      // later visits can reuse the browser/service-worker cache.
      void prepareModels();
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      const message = reason instanceof Error ? reason.message : "The camera could not be opened.";
      setError(message);
    } finally {
      setStarting(false);
    }
  };

  const capture = async () => {
    if (!cameraActive || !modelReady || modelLoading || capturing || disabled || !videoRef.current) return;
    setCapturing(true);
    setError("");
    setNotice("");
    try {
      const embedding = await extractFaceEmbedding(videoRef.current);
      stopCamera();
      await onCapture(embedding);
      setNotice("Registration completed. The camera image and video stayed on this phone; only the encrypted face feature was sent to CampusFace.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Face capture or registration failed. Restart the camera and try again.");
    } finally {
      setCapturing(false);
    }
  };

  const progressValue = modelProgress?.percent;

  return (
    <section className="panel face-camera-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">PHONE CAMERA / ON-DEVICE RECOGNITION</div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <ScanFace size={22} aria-hidden="true" />
      </div>

      <div className={cameraActive ? "face-camera-preview active" : "face-camera-preview"}>
        <video ref={videoRef} className={cameraFacing === "user" ? "face-camera-selfie" : undefined} playsInline muted autoPlay aria-label="Live camera preview" />
        {!cameraActive && (
          <div className="face-camera-placeholder">
            <CameraOff size={27} />
            <span>Camera is off</span>
            <small>Camera access begins only after you press Start camera.</small>
          </div>
        )}
        {cameraActive && <span className="face-camera-guidance">Keep one face inside the oval</span>}
      </div>

      {modelLoading && (
        <div className="face-model-progress" role="status" aria-live="polite">
          <div className="face-model-progress-heading">
            <LoaderCircle size={17} className="spin" />
            <strong>{modelProgress?.stage || "Preparing face models..."}</strong>
          </div>
          <p>{modelProgress?.detail || "Keep CampusFace open while setup finishes."}</p>
          {progressValue !== undefined && (
            <div
              className="face-model-progress-track"
              role="progressbar"
              aria-label="Face model download progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressValue}
            >
              <span style={{ width: `${progressValue}%` }} />
            </div>
          )}
          <small>First setup may take a few minutes on a slow connection. Later visits reuse cached files.</small>
        </div>
      )}

      <div className="face-camera-actions">
        {!cameraActive ? (
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCameraFacing((current) => current === "environment" ? "user" : "environment")}
              disabled={disabled || starting || capturing}
            >
              <Camera size={16} />
              {cameraFacing === "environment" ? "Use front camera" : "Use rear camera"}
            </button>
            <button className="secondary-button" type="button" onClick={() => void startCamera()} disabled={disabled || starting || capturing}>
              {starting ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}
              {starting ? "Opening camera..." : "Start camera"}
            </button>
          </>
        ) : (
          <>
            <button
              className="primary-button"
              type="button"
              onClick={() => modelReady ? void capture() : void prepareModels()}
              disabled={disabled || capturing || modelLoading}
            >
              {capturing || modelLoading
                ? <LoaderCircle size={16} className="spin" />
                : modelReady ? <ScanFace size={16} /> : <RefreshCw size={16} />}
              {capturing
                ? "Registering securely..."
                : modelLoading
                  ? "Preparing face models..."
                  : modelReady
                    ? actionLabel
                    : "Retry model setup"}
            </button>
            <button className="secondary-button" type="button" onClick={stopCamera} disabled={capturing}>
              <CameraOff size={16} />
              Stop camera
            </button>
          </>
        )}
        <span className="face-camera-local-note"><ShieldCheck size={14} /> Video stays on this phone</span>
      </div>

      <p className="face-camera-local-note">Face-detection and recognition files are hosted with CampusFace and prepared on this phone. Camera frames are not uploaded. Only the numeric face feature is sent for encrypted processing.</p>
      {error && <div className="student-form-message" role="alert">{error}</div>}
      {notice && <div className="face-camera-success" role="status">{notice}</div>}
    </section>
  );
}
