import React, { useState, useRef, useEffect } from 'react';
import cv from '@techstark/opencv-js';
import jsQR from 'jsqr';

const DocumentScanner = ({ onDocumentCaptured, vehicleId }) => {
    const [capturedImage, setCapturedImage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [cvLoaded, setCvLoaded] = useState(false);
    const [cameraError, setCameraError] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    // Initialize OpenCV
    useEffect(() => {
        // Check if cv is already loaded
        if (cv.getBuildInformation) {
            setCvLoaded(true);
        } else {
            cv.onRuntimeInitialized = () => {
                setCvLoaded(true);
            };
        }
    }, []);

    // Start Camera
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setCameraError(null);
        } catch (err) {
            console.error("Error accessing camera:", err);
            setCameraError("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    };

    // Stop Camera
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    useEffect(() => {
        return () => stopCamera();
    }, []);

    // Detect Document Edges
    const detectDocumentEdges = (srcMat) => {
        if (!cvLoaded) return null;

        let gray = new cv.Mat();
        cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

        let blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        let edges = new cv.Mat();
        cv.Canny(blurred, edges, 75, 200);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestContour = null;
        let maxArea = 0;

        for (let i = 0; i < contours.size(); i++) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();

            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

            if (approx.rows === 4 && area > maxArea && area > 5000) { // Min area filter
                maxArea = area;
                if (bestContour) bestContour.delete();
                bestContour = approx; // Keep the Mat
            } else {
                approx.delete();
            }
        }

        // Clean up
        gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();

        return bestContour;
    };

    // Detect QR Codes
    const detectQRCodes = (imageData) => {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert"
        });

        if (code) {
            return [{
                data: code.data,
                location: code.location
            }];
        }
        return [];
    };

    // Capture Image function
    const captureImage = () => {
        if (!videoRef.current || !canvasRef.current || !cvLoaded) return;

        setIsProcessing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const src = cv.matFromImageData(imageData);

            // 1. Detect Edges (Optional: Use for perspective transform if needed later)
            const documentContour = detectDocumentEdges(src);

            // 2. Detect QR
            const qrCodes = detectQRCodes(imageData);

            // 3. Prepare result blob
            canvas.toBlob((blob) => {
                const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

                // Clean up Mats
                src.delete();
                if (documentContour) documentContour.delete();

                stopCamera(); // Stop processing stream

                setCapturedImage({
                    processedImage: file,
                    qrCodes: qrCodes,
                    previewUrl: URL.createObjectURL(blob),
                    documentType: null // To be selected by user or AI
                });

                setIsProcessing(false);

                // Auto-trigger if passed (or let user confirm in UI)
                if (onDocumentCaptured && blob) {
                    // We wait for user confirmation typically
                }
            }, 'image/jpeg', 0.95);

        } catch (e) {
            console.error("Processing error:", e);
            setIsProcessing(false);
        }
    };

    const handleConfirm = () => {
        if (capturedImage && onDocumentCaptured) {
            onDocumentCaptured(capturedImage);
            setCapturedImage(null); // Reset
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
        startCamera();
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-bold mb-4">Escanear Documento para: {vehicleId}</h3>

            {/* Viewfinder / Preview */}
            <div className="relative w-full max-w-lg mx-auto bg-black rounded-lg overflow-hidden h-96 flex items-center justify-center">
                {!capturedImage && (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                )}

                {capturedImage && (
                    <img
                        src={capturedImage.previewUrl}
                        className="w-full h-full object-contain"
                        alt="Captured"
                    />
                )}

                <canvas ref={canvasRef} className="hidden" />

                {!capturedImage && !streamRef.current && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <button onClick={startCamera} className="bg-blue-600 text-white px-4 py-2 rounded-full">
                            Iniciar Cámara
                        </button>
                    </div>
                )}

                {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 p-4 text-center">
                        <p className="text-red-500 bg-white/90 p-2 rounded">{cameraError}</p>
                        <button onClick={startCamera} className="mt-2 bg-gray-600 text-white px-3 py-1 rounded text-sm block mx-auto">Reintentar</button>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="mt-4 flex justify-center gap-4">
                {!capturedImage ? (
                    <button
                        onClick={captureImage}
                        disabled={!streamRef.current || isProcessing}
                        className="w-16 h-16 rounded-full border-4 border-white bg-red-500 shadow-lg flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isProcessing && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>}
                    </button>
                ) : (
                    <>
                        <button onClick={handleRetake} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded">
                            Reintentar
                        </button>
                        <button onClick={handleConfirm} className="px-6 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700">
                            Confirmar y Procesar
                        </button>
                    </>
                )}
            </div>

            <div className="mt-2 text-xs text-gray-500 text-center">
                {cvLoaded ? "Motor de procesamiento listo (OpenCV)" : "Cargando motor de procesamiento..."}
            </div>
        </div>
    );
};

export default DocumentScanner;
