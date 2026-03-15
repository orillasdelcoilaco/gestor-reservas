import { FileText, ChevronRight } from 'lucide-react'

const EditableDataForm = ({ data, onChange, onConfirm, onCancel, type }) => {
    const fields = {
        patente: { label: 'Patente', placeholder: 'AA.BB-12' },
        issueDate: { label: 'Fecha Emisión', type: 'date' },
        expiryDate: { label: 'Fecha Vencimiento', type: 'date' },
        ownerName: { label: 'Propietario' },
        marca: { label: 'Marca' },
        modelo: { label: 'Modelo' },
        anio: { label: 'Año', type: 'number' },
        color: { label: 'Color' },
        engineNum: { label: 'N° Motor' },
        vin: { label: 'VIN / Chasis' },
        company: { label: 'Compañía Seguros' },
        municipality: { label: 'Municipalidad' },
    };

    // Filter relevant fields by document type
    let docFields = ['patente', 'issueDate'];
    if (type === 'PADRON') docFields = ['patente', 'issueDate', 'ownerName', 'marca', 'modelo', 'anio', 'color', 'engineNum', 'vin'];
    if (type === 'REVISION') docFields = ['patente', 'issueDate', 'expiryDate'];
    if (type === 'SOAP') docFields = ['patente', 'issueDate', 'expiryDate', 'company'];
    if (type === 'PERMISO') docFields = ['patente', 'issueDate', 'expiryDate', 'municipality'];

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mt-4">
            <h4 className="font-bold text-gray-800 mb-4 flex items-center">
                <FileText className="w-4 h-4 mr-2" /> Verificar Datos Extraídos
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {docFields.map(field => (
                    <div key={field}>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                            {fields[field]?.label || field}
                        </label>
                        <input
                            type={fields[field]?.type || 'text'}
                            value={data[field] || ''}
                            onChange={(e) => onChange(field, e.target.value)}
                            placeholder={fields[field]?.placeholder || ''}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-700"
                        />
                    </div>
                ))}
            </div>
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button onClick={onCancel} className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium">Cancelar</button>
                <button onClick={onConfirm} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 flex items-center shadow-md">
                    Guardar y Continuar <ChevronRight className="w-4 h-4 ml-1" />
                </button>
            </div>
        </div>
    );
};

export default EditableDataForm
