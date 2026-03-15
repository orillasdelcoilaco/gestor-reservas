import React, { useEffect, useState } from 'react';
import { FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

const DocumentList = ({ vehicleId }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!vehicleId) return;

        // Fetch docs
        const fetchDocs = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('firebaseIdToken');
                const res = await fetch(`/api/vehicle-docs/vehicles/${vehicleId}/documents`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                setDocuments(data.documents || []);
            } catch (e) {
                console.error("Error fetching documents:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchDocs();
    }, [vehicleId]);

    if (!vehicleId) return null;
    if (loading) return <div className="p-4 text-center text-gray-500">Cargando documentos...</div>;

    return (
        <div className="mt-6">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-gray-500" />
                Documentos Guardados
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documents.length === 0 && (
                    <p className="text-gray-400 text-sm col-span-2 text-center py-4 bg-gray-50 rounded-lg border-dashed border border-gray-200">
                        No hay documentos procesados aún.
                    </p>
                )}

                {documents.map(doc => (
                    <div key={doc.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold uppercase trackin-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                {doc.type}
                            </span>
                            {doc.status === 'active' && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {doc.status === 'about_to_expire' && <Clock className="w-4 h-4 text-amber-500" />}
                            {doc.status === 'expired' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        </div>

                        <div className="flex gap-3">
                            <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                {doc.images?.processed && (
                                    <img src={doc.images.processed} className="w-full h-full object-cover" alt="Doc" />
                                )}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium text-gray-800 truncate">Vence: {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'N/A'}</p>
                                <p className="text-xs text-gray-500 mt-1">Subido el {new Date(doc.captureDate).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DocumentList;
