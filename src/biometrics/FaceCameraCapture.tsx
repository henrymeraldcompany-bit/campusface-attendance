import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, ScanFace, ShieldCheck } from "lucide-react";
import { extractFaceEmbedding } from "./face-engine";
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
  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          facingMode: { ideal: "environment" },
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
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The camera could not be opened.";
      setError(message);
    } finally {
      setStarting(false);
    }
  };

  const capture = async () => {
    if (!cameraActive || capturing || disabled || !videoRef.current) return;
    setCapturing(true);
    setError("");
    setNotice("");
    try {
      const embedding = await extractFaceEmbedding(videoRef.current);
      stopCamera();
      await onCapture(embedding);
      setNotice("Face feature captured on this phone. No photo or video was uploaded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Face capture failed. Try again.");
    } finally {
      setCapturing(false);
    }
  };

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
        <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera preview" />
        {!cameraActive && (
          <div className="face-camera-placeholder">
            <CameraOff size={27} />
            <span>Camera is off</span>
            <small>Camera access begins only after you press Start camera.</small>
          </div>
        )}
        {cameraActive && <span className="face-camera-guidance">Keep one face inside the frame</span>}
      </div>

      <div className="face-camera-actions">
        {!cameraActive ? (
          <button className="secondary-button" type="button" onClick={() => void startCamera()} disabled={disabled || starting || capturing}>
            {starting ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}
            {starting ? "Opening camera..." : "Start camera"}
          </button>
        ) : (
          <>
            <button className="primary-button" type="button" onClick={() => void capture()} disabled={disabled || capturing}>
              {capturing ? <LoaderCircle size={16} className="spin" /> : <ScanFace size={16} />}
              {capturing ? "Processing on phone..." : actionLabel}
            </button>
            <button className="secondary-button" type="button" onClick={stopCamera} disabled={capturing}>
              <CameraOff size={16} />
              Stop camera
            </button>
          </>
        )}
        <span className="face-camera-local-note"><ShieldCheck size={14} /> Video stays on this phone</span>
      </div>

      <p className="face-camera-local-note">Camera frames are processed on-device and are not uploaded. The vision library may send technical usage metrics; it does not send the camera video.</p>
      {error && <div className="student-form-message" role="alert">{error}</div>}
      {notice && <div className="face-camera-success" role="status">{notice}</div>}
    </section>
  );
}
