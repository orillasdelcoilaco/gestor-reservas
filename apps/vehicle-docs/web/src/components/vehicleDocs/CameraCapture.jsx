import { useState, useEffect, useRef } from 'react'

const CameraCapture = ({ onCapture, onCancel, title }) => {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);

    useEffect(() => {
        const startCamera = async () => {
            try {
                // Try environment camera first
                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                };
                const s = await navigator.mediaDevices.getUserMedia(constraints);
                setStream(s);
                if (videoRef.current) videoRef.current.srcObject = s;
            } catch (err) {
                console.error("Camera error:", err);
                try {
                    // Fallback to any camera
                    const s = await navigator.mediaDevices.getUserMedia({ video: true });
                    setStream(s);
                    if (videoRef.current) videoRef.current.srcObject = s;
                } catch (e) {
                    alert("No se pudo acceder a la cámara. Revisa los permisos.");
                    onCancel();
                }
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, []);

    const capture = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
            onCapture(file);
        }, 'image/jpeg', 0.95);
    };

    return (
        <div className="camera-container">
            <div className="camera-preview">
                <video ref={videoRef} autoPlay playsInline className="camera-video" />
                <div className="camera-overlay">
                    <div className="viewfinder">
                        <div className="viewfinder-text">{title || 'Alinea el documento'}</div>
                    </div>
                </div>
            </div>
            <div className="camera-controls">
                <button onClick={onCancel} className="btn-camera-cancel">Cerrar</button>
                <div className="btn-capture" onClick={capture}>
                    <div className="w-12 h-12 rounded-full border-2 border-gray-200"></div>
                </div>
                <div className="w-20"></div>
            </div>
        </div>
    );
};

export default CameraCapture;
