import { useState, useRef } from 'react'
import axios from 'axios'
import { Camera, Upload, Check, RefreshCw, AlertTriangle, RotateCw, QrCode, X, BrainCircuit } from 'lucide-react'
import CameraCapture from './CameraCapture'
import ImageModal from './ImageModal'
import EditableDataForm from './EditableDataForm'
import ManualCropTool from './ManualCropTool'
import { rotateBlob } from '../../utils/imageUtils'
import { normalizeDate } from '../../utils/dateUtils'

const AiDocumentUpload = ({ type, title, description, onVerified, vehicle, skip }) => {
    const [file, setFile] = useState(null)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState(null)
    const [data, setData] = useState(null)
    const [aiUnavailable, setAiUnavailable] = useState(false)
    const [previewZoom, setPreviewZoom] = useState(null)
    const [rotation, setRotation] = useState(0)
    const [isCameraOpen, setIsCameraOpen] = useState(false)
    const [croppingFile, setCroppingFile] = useState(null)
    const [croppingQr, setCroppingQr] = useState(null)
    const [capturingQr, setCapturingQr] = useState(false)
    const qrInputRef = useRef(null)

    const setFileReady = (f) => { setFile(f); setData(null); setError(null); setRotation(0) }

    const handleFile = (e) => { if (e.target.files[0]) setCroppingFile(e.target.files[0]) }
    const handleCapture = (capturedFile) => { setIsCameraOpen(false); setCroppingFile(capturedFile) }

    const handleQrFileInput = (e) => { if (e.target.files[0]) setCroppingQr(e.target.files[0]) }
    const handleQrCapture = (f) => { setCapturingQr(false); setCroppingQr(f) }

    const analyze = async () => {
        if (!file) return
        setProcessing(true)
        setError(null)
        setAiUnavailable(false)
        const token = localStorage.getItem('firebaseIdToken')

        let workingFile = file;
        if (rotation !== 0 && !file.type.includes('pdf')) {
            workingFile = await rotateBlob(file, rotation);
        }

        const formData = new FormData()
        formData.append('document', workingFile)
        formData.append('expectedDocType', (type || 'OTRO').toUpperCase())

        try {
            const res = await axios.post('/api/vehicle-docs/extract', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            })

            const aiResult = res.data;

            // Usar imágenes PROCESADAS por el backend (Sharp + jsQR)
            let nitidFile = workingFile;
            let qrFile = null;

            // Si el backend retornó imagen procesada, usarla
            if (aiResult.processedImage) {
                try {
                    const processedBlob = await fetch(aiResult.processedImage).then(r => r.blob());
                    nitidFile = new File([processedBlob], file.name, { type: 'image/jpeg' });
                    console.log('[Frontend] ✅ Usando imagen procesada por backend (Sharp)');
                } catch (e) {
                    console.error('[Frontend] Error con imagen procesada:', e);
                }
            }

            // Si el backend extrajo y retornó QR, usarlo
            if (aiResult.qrImage) {
                try {
                    const qrBlob = await fetch(aiResult.qrImage).then(r => r.blob());
                    qrFile = new File([qrBlob], 'qr.jpg', { type: 'image/jpeg' });
                    console.log('[Frontend] ✅ Usando QR extraído por backend');
                } catch (e) {
                    console.error('[Frontend] Error con QR:', e);
                }
            }

            setFile(nitidFile);

            // IA no disponible: abrir formulario vacío para ingreso manual
            if (aiResult.aiUnavailable) {
                setAiUnavailable(true);
                setData({ qrFile });
                return;
            }

            // Normalize legacy type aliases before comparing
            const TYPE_ALIASES = { REVISION_TECNICA: 'REVISION', PERMISO_CIRCULACION: 'PERMISO' }
            const normalizedAiType = TYPE_ALIASES[aiResult.type] || aiResult.type
            const normalizedExpected = TYPE_ALIASES[type] || type
            if (normalizedAiType && normalizedAiType !== normalizedExpected && normalizedAiType !== 'OTRO') {
                if (!window.confirm(`La IA detectó que esto es un ${normalizedAiType}, pero esperábamos un ${normalizedExpected}. ¿Continuar igual?`)) {
                    setProcessing(false)
                    return
                }
            }

            const meta = aiResult.metadata || {};
            if (aiResult.patente) meta.patente = aiResult.patente;
            if (aiResult.marca) meta.marca = aiResult.marca;
            if (aiResult.modelo) meta.modelo = aiResult.modelo;
            if (aiResult.color) meta.color = aiResult.color;
            if (aiResult.anio) meta.anio = aiResult.anio;
            if (aiResult.numeroMotor) meta.numeroMotor = aiResult.numeroMotor;
            if (aiResult.vin) meta.vin = aiResult.vin;
            if (aiResult.issueDate) meta.issueDate = aiResult.issueDate;
            if (aiResult.expiryDate) meta.expiryDate = aiResult.expiryDate;

            const cleanMeta = { ...meta };
            if (aiResult.issueDate) cleanMeta.issueDate = normalizeDate(aiResult.issueDate);
            if (aiResult.expiryDate) cleanMeta.expiryDate = normalizeDate(aiResult.expiryDate);

            setData({ ...cleanMeta, qrFile });
        } catch (err) {
            setError(err.message)
        } finally {
            setProcessing(false)
        }
    }

    const confirm = () => {
        const { qrFile, ...cleanData } = data;
        onVerified({ file, qrFile }, cleanData);
    }

    const updateData = (field, value) => {
        setData(prev => ({ ...prev, [field]: value }))
    }

    if (croppingFile) return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Recortar imagen — {title}</h3>
            <ManualCropTool
                imageFile={croppingFile}
                onConfirm={(f) => { setFileReady(f); setCroppingFile(null) }}
                onSkip={() => { setFileReady(croppingFile); setCroppingFile(null) }}
            />
        </div>
    )

    if (croppingQr) return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Recortar código QR</h3>
            <ManualCropTool
                imageFile={croppingQr}
                onConfirm={(f) => { setData(d => ({ ...d, qrFile: f })); setCroppingQr(null) }}
                onSkip={() => { setData(d => ({ ...d, qrFile: croppingQr })); setCroppingQr(null) }}
            />
        </div>
    )

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
            <p className="text-gray-500 text-sm mb-6">{description}</p>

            <ImageModal src={previewZoom} onClose={() => setPreviewZoom(null)} />

            {isCameraOpen && (
                <CameraCapture
                    title={`Alinea 1-página de: ${title}`}
                    onCapture={handleCapture}
                    onCancel={() => setIsCameraOpen(false)}
                />
            )}

            {capturingQr && (
                <CameraCapture
                    title="Fotografía el código QR"
                    onCapture={handleQrCapture}
                    onCancel={() => setCapturingQr(false)}
                />
            )}

            {!data ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setIsCameraOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-xl flex flex-col items-center justify-center transition-all shadow-lg active:scale-95 group"
                        >
                            <Camera className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="font-black text-xs uppercase tracking-wider">Tomar Foto</span>
                        </button>

                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center bg-gray-50 hover:bg-white transition-all relative group h-full">
                            <input className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" type="file" onChange={handleFile} accept="image/*,application/pdf" />
                            <Upload className="w-6 h-6 mx-auto text-gray-300 mb-2 group-hover:text-indigo-400" />
                            <span className="text-[10px] font-bold text-gray-400 block">SUBIR ARCHIVO O PDF</span>
                        </div>
                    </div>

                    {file && !file.type.includes('pdf') && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative w-full max-w-sm aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                                <img
                                    src={URL.createObjectURL(file)}
                                    alt="Doc preview"
                                    className="w-full h-full object-contain transition-transform duration-300"
                                    style={{ transform: `rotate(${rotation}deg)` }}
                                />
                                <button
                                    onClick={() => setRotation(r => (r + 90) % 360)}
                                    className="absolute bottom-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow hover:bg-white text-indigo-600"
                                    title="Rotar imagen"
                                >
                                    <RotateCw className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {file && (
                        <button
                            disabled={processing}
                            onClick={analyze}
                            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold disabled:bg-indigo-300 flex justify-center items-center shadow-md transition-all"
                        >
                            {processing ? <RefreshCw className="animate-spin w-5 h-5 mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                            {processing ? 'Analizando con IA...' : 'Analizar Documento'}
                        </button>
                    )}

                    <button onClick={() => setData({})} className="w-full text-indigo-600 text-sm font-medium hover:underline">Omitir IA y completar manualmente</button>
                    {skip && <button onClick={skip} className="w-full text-gray-400 text-sm hover:underline mt-2">Saltar este documento por ahora</button>}
                </div>
            ) : (
                <div className="space-y-4">
                    {aiUnavailable && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                            <BrainCircuit className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-amber-800">IA no disponible</p>
                                <p className="text-xs text-amber-700 mt-0.5">La extracción automática falló (cuota agotada). Completa los datos manualmente.</p>
                            </div>
                        </div>
                    )}
                    <EditableDataForm
                        data={data}
                        type={type}
                        onChange={updateData}
                        onConfirm={confirm}
                        onCancel={() => { setData(null); setFile(null); setAiUnavailable(false); }}
                    />

                    {/* QR Panel */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Código QR</p>
                        {data.qrFile ? (
                            <div className="flex items-center gap-3">
                                <img
                                    src={URL.createObjectURL(data.qrFile)}
                                    className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white cursor-pointer"
                                    onClick={() => setPreviewZoom(URL.createObjectURL(data.qrFile))}
                                    alt="QR"
                                />
                                <div>
                                    <p className="text-xs font-bold text-green-600 mb-1">QR capturado</p>
                                    <button
                                        onClick={() => setData(d => ({ ...d, qrFile: null }))}
                                        className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Eliminar QR
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="text-xs text-gray-500 mb-3">QR no detectado automáticamente. Puedes agregarlo manualmente.</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCapturingQr(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all"
                                    >
                                        <Camera className="w-4 h-4" /> Fotografiar QR
                                    </button>
                                    <button
                                        onClick={() => qrInputRef.current?.click()}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300 transition-all"
                                    >
                                        <QrCode className="w-4 h-4" /> Subir imagen QR
                                    </button>
                                    <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrFileInput} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {error && <p className="mt-4 text-red-600 text-sm bg-red-50 p-3 rounded-lg flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> {error}</p>}
        </div>
    )
}

export default AiDocumentUpload
