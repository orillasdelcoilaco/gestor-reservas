import React, { useState, useEffect } from 'react';
import VehicleList from '../components/vehicleDocs/VehicleList';
import DocumentList from '../components/vehicleDocs/DocumentList';
import DocumentScanner from '../components/vehicleDocs/DocumentScanner';
import { Plus } from 'lucide-react';

const VehicleDocs = () => {
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [isScanning, setIsScanning] = useState(false);

    // Load vehicles on mount
    useEffect(() => {
        const fetchVehicles = async () => {
            try {
                const token = localStorage.getItem('firebaseIdToken');
                if (!token) return;

                const res = await fetch('/api/vehicle-docs/vehicles', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setVehicles(data.vehicles || []);
                }
            } catch (e) {
                console.error("Error loading vehicles:", e);
            }
        };

        fetchVehicles();
    }, []);

    const handleDocumentCaptured = async (capturedData) => {
        if (!selectedVehicle) return;

        try {
            const token = localStorage.getItem('firebaseIdToken');
            const formData = new FormData();
            formData.append('document', capturedData.processedImage);
            formData.append('detectedQRs', JSON.stringify(capturedData.qrCodes));
            formData.append('vehicleId', selectedVehicle.id);
            // Default doc type or ask user
            const type = prompt("Tipo de documento (PADRON, SOAP, REVISION_TECNICA, PERMISO_CIRCULACION):", "PADRON");
            if (!type) return;
            formData.append('expectedDocType', type.toUpperCase());

            const res = await fetch('/api/vehicle-docs/process', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await res.json();
            if (result.success) {
                alert("Documento procesado correctamente.");
                setIsScanning(false);
                // Refresh logic could go here
                window.location.reload();
            } else {
                alert("Error: " + result.error);
            }

        } catch (e) {
            console.error("Upload error:", e);
            alert("Error de conexión");
        }
    };

    return (
        <div className="container mx-auto p-4 max-w-6xl">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">Gestión Documental</h1>
                    <p className="text-gray-500 text-sm">Administra los documentos de tus vehículos</p>
                </div>
                {selectedVehicle && !isScanning && (
                    <button
                        onClick={() => setIsScanning(true)}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-indigo-700 flex items-center"
                    >
                        <Plus className="w-5 h-5 mr-1" /> Nuevo Doc
                    </button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar List */}
                <div className="lg:col-span-1">
                    <VehicleList
                        vehicles={vehicles}
                        selectedVehicle={selectedVehicle}
                        onSelectVehicle={(v) => { setSelectedVehicle(v); setIsScanning(false); }}
                    />
                </div>

                {/* Main Content */}
                <div className="lg:col-span-3">
                    {selectedVehicle ? (
                        <>
                            {isScanning ? (
                                <div className="mb-6">
                                    <button onClick={() => setIsScanning(false)} className="text-sm text-gray-500 hover:text-gray-800 mb-2 underline">
                                        &larr; Volver
                                    </button>
                                    <DocumentScanner
                                        vehicleId={selectedVehicle.id}
                                        onDocumentCaptured={handleDocumentCaptured}
                                    />
                                </div>
                            ) : (
                                <DocumentList vehicleId={selectedVehicle.id} />
                            )}
                        </>
                    ) : (
                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center h-64 flex flex-col items-center justify-center text-gray-400">
                            <p>Selecciona un vehículo de la lista para ver sus documentos.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VehicleDocs;
