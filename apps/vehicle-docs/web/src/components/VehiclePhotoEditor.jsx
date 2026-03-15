import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Camera, Upload, Check, RotateCw, X, Trash2 } from 'lucide-react'

const VehiclePhotoEditor = ({ onSave, onCancel }) => {
    const [image, setImage] = useState(null)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

    const onSelectFile = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const reader = new FileReader()
            reader.addEventListener('load', () => setImage(reader.result))
            reader.readAsDataURL(e.target.files[0])
        }
    }

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const getCroppedImg = async () => {
        try {
            const canvas = document.createElement('canvas')
            const img = new Image()
            img.src = image
            await new Promise((resolve) => { img.onload = resolve })

            const ctx = canvas.getContext('2d')
            const { x, y, width, height } = croppedAreaPixels

            canvas.width = width
            canvas.height = height

            ctx.translate(width / 2, height / 2)
            ctx.rotate((rotation * Math.PI) / 180)
            ctx.translate(-width / 2, -height / 2)

            ctx.drawImage(
                img,
                x, y, width, height,
                0, 0, width, height
            )

            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve(blob)
                }, 'image/jpeg')
            })
        } catch (e) {
            console.error(e)
            return null
        }
    }

    const handleSave = async () => {
        const croppedBlob = await getCroppedImg()
        if (croppedBlob) {
            onSave(croppedBlob)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                    <Camera className="w-5 h-5 mr-2 text-indigo-600" />
                    Foto del Vehículo
                </h3>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    <X className="w-6 h-6" />
                </button>
            </div>

            {!image ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all">
                            <Upload className="w-10 h-10 text-gray-400 mb-2" />
                            <span className="text-sm font-medium text-gray-600">Subir Archivo</span>
                            <input type="file" className="hidden" onChange={onSelectFile} accept="image/*" />
                        </label>
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all">
                            <Camera className="w-10 h-10 text-gray-400 mb-2" />
                            <span className="text-sm font-medium text-gray-600">Capturar Foto</span>
                            <input type="file" className="hidden" capture="environment" onChange={onSelectFile} accept="image/*" />
                        </label>
                    </div>
                    <p className="text-center text-xs text-gray-400">Captura una foto clara del frente o lateral del vehículo donde se vea el modelo y patente si es posible.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="relative h-80 w-full bg-gray-900 rounded-lg overflow-hidden">
                        <Cropper
                            image={image}
                            crop={crop}
                            zoom={zoom}
                            rotation={rotation}
                            aspect={16 / 9}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                            onRotationChange={setRotation}
                        />
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Zoom</label>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                onChange={(e) => setZoom(e.target.value)}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>
                        <button
                            onClick={() => setRotation((r) => (r + 90) % 360)}
                            className="bg-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors"
                        >
                            <RotateCw className="w-5 h-5 text-gray-600" />
                        </button>
                        <button
                            onClick={() => setImage(null)}
                            className="bg-red-50 p-3 rounded-full hover:bg-red-100 transition-colors"
                        >
                            <Trash2 className="w-5 h-5 text-red-600" />
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button onClick={onCancel} className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center px-8 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-md transition-all"
                        >
                            <Check className="w-5 h-5 mr-2" />
                            Guardar y Continuar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VehiclePhotoEditor
