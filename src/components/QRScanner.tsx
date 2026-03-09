"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type ScanResult = {
  success: boolean;
  alreadyCheckedIn?: boolean;
  person?: { first_name: string; last_name: string };
  event?: { name: string; event_date: string };
  error?: string;
};

export default function QRScanner({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const cooldownRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [personName, setPersonName] = useState("");
  const [cameraError, setCameraError] = useState("");

  const processQRCode = useCallback(
    async (data: string) => {
      // Prevent duplicate scans
      if (cooldownRef.current || data === lastScannedRef.current) return;
      cooldownRef.current = true;
      lastScannedRef.current = data;

      // Expected QR format: JSON with personId, or just a person UUID
      let personId = "";
      try {
        const parsed = JSON.parse(data);
        personId = parsed.personId || parsed.id || "";
      } catch {
        // Assume raw UUID
        personId = data.trim();
      }

      if (!personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
        setStatus("error");
        setMessage("Invalid QR code");
        setTimeout(() => {
          setStatus("scanning");
          setMessage("");
          cooldownRef.current = false;
        }, 2000);
        return;
      }

      try {
        const res = await fetch("/api/qr-checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId, eventId }),
        });

        const result: ScanResult = await res.json();

        if (result.success) {
          const name = `${result.person?.first_name} ${result.person?.last_name}`;
          setPersonName(name);

          if (result.alreadyCheckedIn) {
            setStatus("success");
            setMessage(`${name} already checked in`);
          } else {
            setStatus("success");
            setMessage(`Welcome, ${name}!`);
          }
        } else {
          setStatus("error");
          setMessage(result.error || "Check-in failed");
        }
      } catch {
        setStatus("error");
        setMessage("Network error");
      }

      // Reset after showing result
      setTimeout(() => {
        setStatus("scanning");
        setMessage("");
        setPersonName("");
        cooldownRef.current = false;
        lastScannedRef.current = "";
      }, 3000);
    },
    [eventId]
  );

  useEffect(() => {
    let animFrame: number;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("scanning");
          scanningRef.current = true;
          scanFrame();
        }
      } catch (err) {
        setCameraError(
          "Camera access denied. Please allow camera permissions to use QR scanning."
        );
      }
    }

    function scanFrame() {
      if (!scanningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrame = requestAnimationFrame(scanFrame);
        return;
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Use BarcodeDetector if available (Chrome/Edge/Safari)
      if ("BarcodeDetector" in window) {
        const detector = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (source: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
          formats: ["qr_code"],
        });
        detector
          .detect(canvas)
          .then((barcodes: Array<{ rawValue: string }>) => {
            if (barcodes.length > 0) {
              processQRCode(barcodes[0].rawValue);
            }
          })
          .catch(() => {});
      }

      animFrame = requestAnimationFrame(scanFrame);
    }

    startCamera();

    return () => {
      scanningRef.current = false;
      cancelAnimationFrame(animFrame);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [processQRCode]);

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-[#10454f] font-medium">{cameraError}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Camera viewfinder */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scanning overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-48 h-48 border-2 rounded-xl transition-colors duration-300 ${
              status === "success"
                ? "border-green-400"
                : status === "error"
                  ? "border-red-400"
                  : "border-white/70"
            }`}
          >
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl" />
          </div>
        </div>

        {/* Scanning line animation */}
        {status === "scanning" && (
          <div className="absolute left-1/2 -translate-x-1/2 w-44 top-1/2 -translate-y-1/2">
            <div className="h-0.5 bg-[#3a9ca1] animate-pulse rounded-full" />
          </div>
        )}
      </div>

      {/* Result message */}
      {message && (
        <div
          className={`mt-4 p-4 rounded-2xl text-center font-medium ${
            status === "success"
              ? "bg-[#3a9ca1]/10 text-[#1f6d73]"
              : "bg-red-50 text-red-600"
          }`}
        >
          {status === "success" && (
            <div className="flex items-center justify-center gap-2 mb-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg">{personName}</span>
            </div>
          )}
          <p className="text-sm">{message}</p>
        </div>
      )}

      {status === "scanning" && !message && (
        <p className="mt-3 text-center text-sm text-gray-500">
          Point camera at a member QR code
        </p>
      )}
    </div>
  );
}
