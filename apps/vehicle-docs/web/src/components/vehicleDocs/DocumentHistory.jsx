import { useState, useEffect } from 'react';
import './DocumentHistory.css';

function DocumentHistory({ vehicleId, documentType, onClose }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadHistory();
    }, [vehicleId, documentType]);

    async function loadHistory() {
        try {
            setLoading(true);
            const response = await fetch(
                `/api/vehicle-docs/vehicles/${vehicleId}/documents/${documentType}/history`
            );
            const result = await response.json();

            if (result.success) {
                setHistory(result.history);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error('Error cargando historial:', err);
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    }

    function getStatusLabel(status) {
        const labels = {
            'current': 'Vigente',
            'expired': 'Vencido',
            'archived': 'Archivado'
        };
        return labels[status] || status;
    }

    function getStatusClass(status) {
        return `status-badge status-${status}`;
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function getDocumentLabel(type) {
        const labels = {
            'PADRON': 'Padrón',
            'PERMISO_CIRCULACION': 'Permiso de Circulación',
            'REVISION_TECNICA': 'Revisión Técnica',
            'SOAP': 'SOAP'
        };
        return labels[type] || type;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="history-modal" onClick={e => e.stopPropagation()}>
                <div className="history-header">
                    <h2>Historial: {getDocumentLabel(documentType)}</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="history-content">
                    {loading && (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Cargando historial...</p>
                        </div>
                    )}

                    {error && (
                        <div className="error-state">
                            <p>❌ {error}</p>
                            <button onClick={loadHistory}>Reintentar</button>
                        </div>
                    )}

                    {!loading && !error && history.length === 0 && (
                        <div className="empty-state">
                            <p>📋 No hay documentos en el historial</p>
                        </div>
                    )}

                    {!loading && !error && history.length > 0 && (
                        <div className="timeline">
                            {history.map((doc, index) => (
                                <div key={doc.id} className="timeline-item">
                                    <div className="timeline-marker">
                                        {index === 0 && doc.status === 'current' && (
                                            <div className="marker-current">●</div>
                                        )}
                                        {(index > 0 || doc.status !== 'current') && (
                                            <div className="marker-past">○</div>
                                        )}
                                    </div>

                                    <div className="timeline-card">
                                        <div className="card-header">
                                            <span className={getStatusClass(doc.status)}>
                                                {getStatusLabel(doc.status)}
                                            </span>
                                            <span className="capture-date">
                                                Capturado: {formatDate(doc.captureDate)}
                                            </span>
                                        </div>

                                        <div className="card-body">
                                            <div className="info-row">
                                                <span className="label">Emisión:</span>
                                                <span className="value">{formatDate(doc.issueDate)}</span>
                                            </div>

                                            {doc.expiryDate && (
                                                <div className="info-row">
                                                    <span className="label">Vencimiento:</span>
                                                    <span className="value">{formatDate(doc.expiryDate)}</span>
                                                </div>
                                            )}

                                            {doc.issueLocation && (
                                                <div className="info-row">
                                                    <span className="label">Lugar:</span>
                                                    <span className="value">{doc.issueLocation}</span>
                                                </div>
                                            )}

                                            {doc.issueEntity && (
                                                <div className="info-row">
                                                    <span className="label">Entidad:</span>
                                                    <span className="value">{doc.issueEntity}</span>
                                                </div>
                                            )}

                                            {doc.notes && (
                                                <div className="info-row notes">
                                                    <span className="label">Notas:</span>
                                                    <span className="value">{doc.notes}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="card-footer">
                                            {doc.images?.processed && (
                                                <a
                                                    href={doc.images.processed}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="view-doc-btn"
                                                >
                                                    Ver documento
                                                </a>
                                            )}

                                            {doc.images?.qr && (
                                                <a
                                                    href={doc.images.qr}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="view-qr-btn"
                                                >
                                                    Ver QR
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DocumentHistory;
