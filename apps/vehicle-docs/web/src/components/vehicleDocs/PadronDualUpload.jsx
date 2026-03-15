import { useState } from 'react'
import axios from 'axios'
import { Camera, Upload, RefreshCw, ChevronRight, Trash2, RotateCw } from 'lucide-react'
import CameraCapture from './CameraCapture'
import ImageModal from './ImageModal'
import EditableDataForm from './EditableDataForm'
import ManualCropTool from './ManualCropTool'
import { rotateBlob, cropBlob } from '../../utils/imageUtils'
import { normalizeDate } from '../../utils/dateUtils'

const PadronDualUpload = ({ onVerified, onCancel }) => {
    const [phase, setPhase] = useState('FRONT') // FRONT, BACK, REVIEW
    const [frontFile, setFrontFile] = useState(null)
    const [backFile, setBackFile] = useState(null)
    const [originalFront, setOriginalFront] = useState(null)
    const [originalBack, setOriginalBack] = useState(null)
    const [useOriginal, setUseOriginal] = useState({ front: false, back: false })
    const [frontData, setFrontData] = useState(null)
    const [backData, setBackData] = useState(null)
    const [processing, setProcessing] = useState(false)
    const [mergedData, setMergedData] = useState(null)
    const [previewZoom, setPreviewZoom] = useState(null)
    const [frontRotation, setFrontRotation] = useState(0)
    const [backRotation, setBackRotation] = useState(0)
    const [isCameraOpen, setIsCameraOpen] = useState(false)
    const [croppingFile, setCroppingFile] = useState(null) // file pendiente de recorte
    const [qrFile, setQrFile] = useState(null)             // foto manual del QR
    const [capturingQr, setCapturingQr] = useState(false)  // abriendo cámara para QR

    const handleCapture = (capturedFile) => {
        setIsCameraOpen(false)
        setCroppingFile(capturedFile)
    }

    const handleCropConfirm = (croppedFile) => {
        if (phase === 'FRONT') {
            setFrontFile(croppedFile); setOriginalFront(null); setFrontRotation(0)
        } else {
            setBackFile(croppedFile); setOriginalBack(null); setBackRotation(0)
        }
        setCroppingFile(null)
    }

    const analyze = async (file, side) => {
        setProcessing(true)
        const token = localStorage.getItem('firebaseIdToken')

        let workingFile = file;
        const rotation = side === 'FRONT' ? frontRotation : backRotation;
        if (rotation !== 0) {
            workingFile = await rotateBlob(file, rotation);
        }

        const formData = new FormData()
        formData.append('document', workingFile)
        formData.append('expectedDocType', 'PADRON')

        try {
            const res = await axios.post('/api/vehicle-docs/extract', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            })

            const aiResult = res.data;
            const meta = aiResult.metadata || {};
            if (aiResult.patente) meta.patente = aiResult.patente;
            if (aiResult.issueDate) meta.issueDate = aiResult.issueDate;

            // AUTO-ALIGN & CROP
            let nitidFile = workingFile;
            let qrFile = null;

            if (!file.type.includes('pdf')) {
                // 1. Suggested Rotation
                if (aiResult.suggestedRotation && aiResult.suggestedRotation !== 0) {
                    nitidFile = await rotateBlob(nitidFile, aiResult.suggestedRotation);
                }

                // 2. Main Copy Crop with Sanity Check
                const box = aiResult.mainCopyBox;
                if (box && Array.isArray(box) && box.length === 4) {
                    const [ymin, xmin, ymax, xmax] = box;
                    const h = ymax - ymin;
                    const w = xmax - xmin;
                    // Only crop if the box is substantial (e.g. >15% of image height/width)
                    if (h > 150 && w > 150) {
                        try {
                            nitidFile = await cropBlob(nitidFile, box);
                        } catch (e) { console.error('Auto-crop error', e); }
                    } else {
                        console.warn('Ignoring suspicious mainCopyBox (too small)', box);
                    }
                }

                // 3. QR Code Crop with Padding
                if (aiResult.qrCodeBox) {
                    try {
                        let [ymin, xmin, ymax, xmax] = aiResult.qrCodeBox;
                        const padH = (ymax - ymin) * 0.1;
                        const padW = (xmax - xmin) * 0.1;
                        const paddedBox = [
                            Math.max(0, ymin - padH),
                            Math.max(0, xmin - padW),
                            Math.min(1000, ymax + padH),
                            Math.min(1000, xmax + padW)
                        ];
                        qrFile = await cropBlob(nitidFile, paddedBox);
                    } catch (e) { console.error('QR-crop error', e); }
                }
            }

            const cleanMeta = { ...meta };
            if (aiResult.issueDate) cleanMeta.issueDate = normalizeDate(aiResult.issueDate);
            if (aiResult.expiryDate) cleanMeta.expiryDate = normalizeDate(aiResult.expiryDate);

            if (side === 'FRONT') {
                setOriginalFront(workingFile);
                setFrontFile(nitidFile);
                setFrontData({ ...cleanMeta, qrFile });
                setPhase('BACK')
            } else {
                setOriginalBack(workingFile);
                setBackFile(nitidFile);
                setBackData(cleanMeta)
                mergeAndReview(frontData, cleanMeta)
            }
        } catch (err) {
            alert('Error al analizar: ' + err.message)
        } finally {
            setProcessing(false)
        }
    }

    const mergeAndReview = (fData, bData) => {
        const merged = { ...fData, ...bData }
        if (fData.patente) merged.patente = fData.patente
        if (bData.patente && !merged.patente) merged.patente = bData.patente
        setMergedData(merged)
        setPhase('REVIEW')
    }

    const handleConfirm = () => {
        const autoQr = frontData?.qrFile
        const finalFront = useOriginal.front ? originalFront : frontFile
        const finalBack  = useOriginal.back  ? originalBack  : backFile
        onVerified({ front: finalFront, back: finalBack, qrFile: qrFile || autoQr }, mergedData)
    }

    const updateMergedData = (field, value) => {
        setMergedData(prev => ({ ...prev, [field]: value }))
    }

    // Handlers
    const handleFrontFile = (e) => { if (e.target.files[0]) setCroppingFile(e.target.files[0]) }
    const handleBackFile  = (e) => { if (e.target.files[0]) setCroppingFile(e.target.files[0]) }

    // Recorte de imagen de documento
    if (croppingFile) {
        const label = capturingQr ? 'QR del Padrón' : (phase === 'FRONT' ? 'Frente del Padrón' : 'Reverso del Padrón')
        return (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-1">Recortar imagen — {label}</h3>
                <ManualCropTool
                    imageFile={croppingFile}
                    onConfirm={(f) => {
                        if (capturingQr) { setQrFile(f); setCapturingQr(false) }
                        else handleCropConfirm(f)
                        setCroppingFile(null)
                    }}
                    onSkip={() => {
                        if (capturingQr) { setQrFile(croppingFile); setCapturingQr(false) }
                        else handleCropConfirm(croppingFile)
                        setCroppingFile(null)
                    }}
                />
            </div>
        )
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
                {phase === 'FRONT' && 'Paso 1.1: Padrón (Frente)'}
                {phase === 'BACK' && 'Paso 1.2: Padrón (Reverso)'}
                {phase === 'REVIEW' && 'Confirmar Datos del Vehículo'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
                {phase === 'FRONT' && 'Sube la cara frontal donde aparece la Patente y Fechas.'}
                {phase === 'BACK' && 'Ahora sube el reverso donde aparecen el Dueño, Color, Motor y Chasis.'}
                {phase === 'REVIEW' && 'Verifica que la información combinada sea correcta.'}
            </p>

            <ImageModal src={previewZoom} onClose={() => setPreviewZoom(null)} />

            {isCameraOpen && (
                <CameraCapture
                    title={`Captura Padrón: ${phase === 'FRONT' ? 'FRENTE' : 'REVERSO'}`}
                    onCapture={handleCapture}
                    onCancel={() => setIsCameraOpen(false)}
                />
            )}

            {capturingQr && !isCameraOpen && (
                <CameraCapture
                    title="Captura el código QR (acércate)"
                    onCapture={(f) => { setCapturingQr(false); setCroppingFile(f) }}
                    onCancel={() => setCapturingQr(false)}
                />
            )}

            {phase !== 'REVIEW' && (
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
                            <input
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                type="file"
                                onChange={phase === 'FRONT' ? handleFrontFile : handleBackFile}
                                accept="image/*,application/pdf"
                            />
                            <Upload className="w-6 h-6 mx-auto text-gray-300 mb-2 group-hover:text-indigo-400" />
                            <span className="text-[10px] font-bold text-gray-400 block uppercase">Subir Archivo</span>
                        </div>
                    </div>
                    {phase === 'FRONT' && (
                        !frontFile ? (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-indigo-50 transition-colors relative">
                                <input className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" type="file" onChange={handleFrontFile} accept="image/*,application/pdf" />
                                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600 font-medium">Subir Frente</p>
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative flex flex-col items-center">
                                <button onClick={() => setFrontFile(null)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 z-10 bg-white rounded-full p-1 shadow">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <div className="relative w-48 h-64 bg-white rounded border border-gray-200 overflow-hidden mb-4">
                                    <img
                                        src={URL.createObjectURL(frontFile)}
                                        className="w-full h-full object-contain"
                                        style={{ transform: `rotate(${frontRotation}deg)` }}
                                    />
                                    <button
                                        onClick={() => setFrontRotation(r => (r + 90) % 360)}
                                        className="absolute bottom-2 right-2 p-1.5 bg-white/80 rounded-full shadow hover:bg-white text-indigo-600"
                                    >
                                        <RotateCw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    )}

                    {phase === 'BACK' && (
                        !backFile ? (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-indigo-50 transition-colors relative">
                                <input className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" type="file" onChange={handleBackFile} accept="image/*,application/pdf" />
                                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600 font-medium">Subir Reverso</p>
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative flex flex-col items-center">
                                <button onClick={() => setBackFile(null)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 z-10 bg-white rounded-full p-1 shadow">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <div className="relative w-48 h-64 bg-white rounded border border-gray-200 overflow-hidden mb-4">
                                    <img
                                        src={URL.createObjectURL(backFile)}
                                        className="w-full h-full object-contain"
                                        style={{ transform: `rotate(${backRotation}deg)` }}
                                    />
                                    <button
                                        onClick={() => setBackRotation(r => (r + 90) % 360)}
                                        className="absolute bottom-2 right-2 p-1.5 bg-white/80 rounded-full shadow hover:bg-white text-indigo-600"
                                    >
                                        <RotateCw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    )}

                    <button
                        disabled={(!frontFile && phase === 'FRONT') || (!backFile && phase === 'BACK') || processing}
                        onClick={() => analyze(phase === 'FRONT' ? frontFile : backFile, phase)}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl disabled:bg-indigo-300 flex justify-center items-center shadow-lg font-black uppercase tracking-widest transition-all"
                    >
                        {processing ? <RefreshCw className="animate-spin w-5 h-5 mr-1" /> : <ChevronRight className="w-5 h-5 mr-1" />}
                        {processing ? 'Analizando...' : (phase === 'FRONT' ? 'Analizar Frente' : 'Analizar Reverso')}
                    </button>
                    {phase === 'FRONT' && <button onClick={onCancel} className="text-sm font-bold text-gray-400 w-full mt-2 hover:text-gray-600">Cancelar Registro</button>}
                    {phase === 'BACK' && <button onClick={() => setPhase('FRONT')} className="text-sm font-black text-indigo-600 w-full mt-2 hover:underline">← Volver al Frente</button>}
                </div>
            )}

            {phase === 'REVIEW' && mergedData && (
                <div className="space-y-6">
                    {/* Visual Preview Section */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Frente</span>
                            <div className="w-full aspect-[4/3] bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm cursor-zoom-in relative" onClick={() => setPreviewZoom(URL.createObjectURL(useOriginal.front ? originalFront : frontFile))}>
                                <img src={URL.createObjectURL(useOriginal.front ? originalFront : frontFile)} alt="Front" className="w-full h-full object-contain" />
                            </div>
                            <button onClick={() => setUseOriginal(v => ({ ...v, front: !v.front }))} className="mt-2 text-[9px] font-bold text-indigo-600 hover:underline">
                                {useOriginal.front ? 'Ver Optimizado' : 'Ver Original'}
                            </button>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Reverso</span>
                            <div className="w-full aspect-[4/3] bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm cursor-zoom-in relative" onClick={() => setPreviewZoom(URL.createObjectURL(useOriginal.back ? originalBack : backFile))}>
                                <img src={URL.createObjectURL(useOriginal.back ? originalBack : backFile)} alt="Back" className="w-full h-full object-contain" />
                            </div>
                            <button onClick={() => setUseOriginal(v => ({ ...v, back: !v.back }))} className="mt-2 text-[9px] font-bold text-indigo-600 hover:underline">
                                {useOriginal.back ? 'Ver Optimizado' : 'Ver Original'}
                            </button>
                        </div>
                        {/* QR — siempre visible, con captura manual */}
                        <div className="flex flex-col items-center col-span-2 md:col-span-1">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 text-center">
                                Código QR
                            </span>
                            {(qrFile || mergedData.qrFile) ? (
                                <>
                                    <div
                                        className="w-24 h-24 bg-white rounded-lg border-2 border-indigo-100 overflow-hidden shadow-md flex items-center justify-center cursor-zoom-in"
                                        onClick={() => setPreviewZoom(URL.createObjectURL(qrFile || mergedData.qrFile))}
                                    >
                                        <img src={URL.createObjectURL(qrFile || mergedData.qrFile)} alt="QR" className="w-full h-full object-contain" />
                                    </div>
                                    <button
                                        onClick={() => setCapturingQr(true)}
                                        className="mt-2 text-[9px] font-bold text-indigo-600 hover:underline"
                                    >
                                        Cambiar QR
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCapturingQr(true)}
                                            className="w-24 h-24 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg flex flex-col items-center justify-center hover:bg-indigo-100 transition-all"
                                        >
                                            <Camera className="w-6 h-6 text-indigo-400 mb-1" />
                                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tight text-center">Foto QR</span>
                                        </button>
                                        <label className="w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center hover:bg-gray-100 transition-all cursor-pointer">
                                            <Upload className="w-5 h-5 text-gray-400 mb-1" />
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tight text-center">Subir QR</span>
                                            <input type="file" accept="image/*" className="hidden"
                                                onChange={(e) => { if (e.target.files[0]) setCroppingFile(e.target.files[0]); setCapturingQr(true) }} />
                                        </label>
                                    </div>
                                    <span className="mt-2 text-[8px] text-gray-400 uppercase font-black">No detectado</span>
                                </>
                            )}
                        </div>
                    </div>

                    <EditableDataForm
                        data={mergedData}
                        type="PADRON"
                        onChange={updateMergedData}
                        onConfirm={handleConfirm}
                        onCancel={() => setPhase('FRONT')}
                    />
                </div>
            )}
        </div>
    )
}

export default PadronDualUpload
