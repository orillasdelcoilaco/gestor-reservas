import { useState, useEffect } from 'react'
import axios from 'axios'
import { Car } from 'lucide-react'
import VehiclePhotoEditor from '../VehiclePhotoEditor'
import PadronDualUpload from './PadronDualUpload'
import AiDocumentUpload from './AiDocumentUpload'

const STEPS = {
    PHOTO: 0,
    PADRON: 1,
    REVISION: 2,
    SOAP: 3,
    PERMISO: 4,
    FINISH: 5
}

const STEP_TITLES = {
    [STEPS.PHOTO]: 'Paso 1: Foto del Vehículo',
    [STEPS.PADRON]: 'Paso 2: Padrón del Vehículo',
    [STEPS.REVISION]: 'Paso 3: Revisión Técnica',
    [STEPS.SOAP]: 'Paso 4: Seguro Obligatorio (SOAP)',
    [STEPS.PERMISO]: 'Paso 5: Permiso de Circulación'
}

const DOC_TYPE_FOR_STEP = {
    [STEPS.PADRON]: 'PADRON',
    [STEPS.REVISION]: 'REVISION',
    [STEPS.SOAP]: 'SOAP',
    [STEPS.PERMISO]: 'PERMISO',
}

const VehicleWizard = ({ onCancel, onFinish, existingVehicle = null }) => {
    const [step, setStep] = useState(existingVehicle ? STEPS.PADRON : STEPS.PHOTO)
    const [existingDocs, setExistingDocs] = useState([])
    const [docsLoaded, setDocsLoaded] = useState(!existingVehicle)

    const [vehicleId, setVehicleId] = useState(existingVehicle?.id || null)
    const [householdId, setHouseholdId] = useState(existingVehicle?.familyGroup || existingVehicle?.householdId || null)
    const [vehiclePhoto, setVehiclePhoto] = useState(null)

    const hasDoc = (type) => existingDocs.some(d => d.type === type)

    // For existing vehicles: fetch docs and jump to first missing step
    useEffect(() => {
        if (!existingVehicle) return
        const fetchDocs = async () => {
            const token = localStorage.getItem('firebaseIdToken')
            try {
                const res = await axios.get(`/api/vehicle-docs/documents?vehicleId=${existingVehicle.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                const docs = Array.isArray(res.data) ? res.data : []
                setExistingDocs(docs)
                // Jump to first missing doc step
                const docSteps = [STEPS.PADRON, STEPS.REVISION, STEPS.SOAP, STEPS.PERMISO]
                const firstMissing = docSteps.find(s => !docs.some(d => d.type === DOC_TYPE_FOR_STEP[s]))
                setStep(firstMissing ?? STEPS.PADRON)
            } catch (e) {
                console.error(e)
                setStep(STEPS.PADRON)
            } finally {
                setDocsLoaded(true)
            }
        }
        fetchDocs()
    }, [])

    // Fetch household ID on mount (only if new vehicle)
    useEffect(() => {
        if (existingVehicle) return
        const fetchHousehold = async () => {
            const token = localStorage.getItem('firebaseIdToken')
            try {
                const res = await axios.get('/api/vehicle-docs/households', { headers: { Authorization: `Bearer ${token}` } })

                // CRITICAL FIX: Check if response is array (API) or string (HTML/404)
                if (Array.isArray(res.data) && res.data.length > 0) {
                    setHouseholdId(res.data[0].id)
                } else {
                    console.warn('[VehicleWizard] Invalid households response (likely HTML), using default.');
                    setHouseholdId('default-family');
                }
            } catch (e) {
                console.error(e);
                // Fallback to prevent hang
                setHouseholdId('default-family');
            }
        }
        fetchHousehold()
    }, [])

    const handlePhotoSave = (blob) => {
        setVehiclePhoto(blob)
        setStep(STEPS.PADRON)
    }

    const handlePadronVerified = async (files, data) => {
        const token = localStorage.getItem('firebaseIdToken')
        if (!token) {
            alert('Sesión no encontrada o expirada. Por favor, inicia sesión nuevamente.')
            return
        }

        try {
            let targetVehicleId

            if (existingVehicle) {
                // Vehículo ya existe: solo subir documentos, no crear vehículo
                targetVehicleId = existingVehicle.id
            } else {
                // Nuevo vehículo: crear primero
                if (!householdId) return
                const formData = new FormData()
                formData.append('patente', data.patente || 'SIN-PATENTE')
                formData.append('marca', data.marca || 'Desconocida')
                formData.append('modelo', data.modelo || 'Desconocido')
                formData.append('anio', data.anio || new Date().getFullYear())
                formData.append('householdId', householdId)
                formData.append('color', data.color || '')
                formData.append('vin', data.vin || '')
                formData.append('engineNum', data.engineNum || '')
                formData.append('chassisNum', data.chassisNum || '')
                if (vehiclePhoto) formData.append('photo', vehiclePhoto, 'vehicle.jpg')

                const vRes = await axios.post('/api/vehicle-docs/vehicles', formData, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                targetVehicleId = vRes.data.id
                setVehicleId(targetVehicleId)
            }

            // Subir frente y reverso en una sola llamada
            if (files.front) {
                const padronForm = new FormData()
                padronForm.append('file', files.front)
                if (files.back)   padronForm.append('fileBack', files.back)
                if (files.qrFile) padronForm.append('qrFile', files.qrFile)
                padronForm.append('vehicleId', targetVehicleId)
                padronForm.append('householdId', householdId || existingVehicle?.familyGroup)
                padronForm.append('type', 'PADRON')
                const meta = { ...data }
                padronForm.append('data', JSON.stringify(meta))
                if (data.issueDate) padronForm.append('issueDate', data.issueDate)
                if (data.expiryDate) padronForm.append('expiryDate', data.expiryDate)
                await axios.post('/api/vehicle-docs/documents', padronForm, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            }

            setStep(STEPS.REVISION)
        } catch (err) {
            alert('Error al guardar Padrón: ' + err.message)
        }
    }

    const uploadDoc = async (vid, type, file, data, qrFile = null) => {
        const token = localStorage.getItem('firebaseIdToken')
        const formData = new FormData()
        formData.append('file', file)
        if (qrFile) formData.append('qrFile', qrFile)
        formData.append('vehicleId', vid)
        formData.append('householdId', householdId || existingVehicle?.householdId)
        formData.append('type', type)
        const meta = { ...data }
        formData.append('data', JSON.stringify(meta))
        if (data.issueDate) formData.append('issueDate', data.issueDate)
        if (data.expiryDate) formData.append('expiryDate', data.expiryDate)

        await axios.post('/api/vehicle-docs/documents', formData, {
            headers: { Authorization: `Bearer ${token}` }
        })
    }

    // AiDocumentUpload calls onVerified({ file, qrFile }, cleanData)
    const handleNextStep = async (files, data) => {
        try {
            let type = 'OTRO'
            if (step === STEPS.REVISION) type = 'REVISION'
            if (step === STEPS.SOAP) type = 'SOAP'
            if (step === STEPS.PERMISO) type = 'PERMISO'

            const actualFile = files?.file || files
            const qrFile = files?.qrFile || null
            await uploadDoc(vehicleId, type, actualFile, data, qrFile)

            if (step === STEPS.PERMISO) onFinish()
            else setStep(step + 1)
        } catch (err) {
            alert('Error al guardar documento: ' + err.message)
        }
    }

    if (!householdId && !existingVehicle) return <div className="p-8 text-center">Cargando configuración...</div>
    if (!docsLoaded) return <div className="p-8 text-center">Verificando documentos existentes...</div>

    // All docs already uploaded
    if (existingVehicle && docsLoaded && [STEPS.PADRON, STEPS.REVISION, STEPS.SOAP, STEPS.PERMISO].every(s => hasDoc(DOC_TYPE_FOR_STEP[s]))) {
        return (
            <div className="max-w-2xl mx-auto py-8 text-center">
                <div className="bg-green-50 text-green-800 p-8 rounded-2xl mb-6">
                    <Car className="w-10 h-10 mx-auto mb-3 text-green-600" />
                    <h3 className="text-xl font-black mb-2">Todos los documentos están cargados</h3>
                    <p className="text-sm text-green-700 mb-6">
                        {existingVehicle.marca} {existingVehicle.modelo} ({existingVehicle.patente}) tiene toda su documentación al día.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button onClick={() => setStep(STEPS.PADRON)} className="bg-green-700 text-white py-3 px-6 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-green-800 transition-all">
                            Renovar un documento igual
                        </button>
                        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm font-medium">Volver al vehículo</button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{STEP_TITLES[step]}</h2>

            {existingVehicle && (
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-6 text-sm flex items-center">
                    <Car className="w-5 h-5 mr-2 shrink-0" />
                    Completando documentos para: <b className="ml-1">{existingVehicle.marca} {existingVehicle.modelo} ({existingVehicle.patente})</b>
                </div>
            )}

            {step === STEPS.PHOTO && (
                <VehiclePhotoEditor
                    onSave={handlePhotoSave}
                    onCancel={onCancel}
                />
            )}
            {step === STEPS.PADRON && (
                <>
                    {existingVehicle && hasDoc('PADRON') && (
                        <div className="bg-green-50 border border-green-100 text-green-800 p-4 rounded-xl mb-4 flex items-center justify-between">
                            <span className="text-sm font-medium">Ya tienes el Padrón cargado</span>
                            <button
                                onClick={() => setStep(STEPS.REVISION)}
                                className="bg-green-600 text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-green-700 transition-all"
                            >
                                Omitir →
                            </button>
                        </div>
                    )}
                    <PadronDualUpload
                        onVerified={handlePadronVerified}
                        onCancel={onCancel}
                    />
                </>
            )}
            {step === STEPS.REVISION && (
                <AiDocumentUpload
                    type="REVISION"
                    title="Revisión Técnica"
                    description="Sube el certificado vigente. Verificaremos fecha, resultado y Código QR si existe."
                    onVerified={handleNextStep}
                    skip={() => setStep(step + 1)}
                />
            )}
            {step === STEPS.SOAP && (
                <AiDocumentUpload
                    type="SOAP"
                    title="Seguro Obligatorio (SOAP)"
                    description="Sube la póliza del seguro obligatorio."
                    onVerified={handleNextStep}
                    skip={() => setStep(step + 1)}
                />
            )}
            {step === STEPS.PERMISO && (
                <AiDocumentUpload
                    type="PERMISO"
                    title="Permiso de Circulación"
                    description="Sube el permiso de la municipalidad."
                    onVerified={handleNextStep}
                    skip={onFinish}
                />
            )}

            <div className="mt-6 flex justify-center">
                {step !== STEPS.PADRON && <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm">Cancelar proceso</button>}
            </div>
        </div>
    )
}

export default VehicleWizard
