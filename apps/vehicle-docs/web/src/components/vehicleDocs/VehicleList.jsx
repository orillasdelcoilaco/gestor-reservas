import React from 'react';
import { Car, ChevronRight } from 'lucide-react';

const VehicleList = ({ vehicles, selectedVehicle, onSelectVehicle }) => {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-bold text-gray-700 flex items-center">
                    <Car className="w-5 h-5 mr-2 text-indigo-500" />
                    Mis Vehículos
                </h3>
            </div>
            <div className="divide-y divide-gray-100">
                {vehicles.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        No tienes vehículos registrados.
                    </div>
                ) : (
                    vehicles.map(v => (
                        <div
                            key={v.id}
                            onClick={() => onSelectVehicle(v)}
                            className={`p-4 cursor-pointer transition-colors flex justify-between items-center ${selectedVehicle?.id === v.id
                                    ? 'bg-indigo-50 border-l-4 border-indigo-500'
                                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                                }`}
                        >
                            <div>
                                <p className="font-bold text-gray-800">{v.patente}</p>
                                <p className="text-xs text-gray-500">{v.marca} {v.modelo} ({v.año})</p>
                            </div>
                            <ChevronRight className={`w-5 h-5 ${selectedVehicle?.id === v.id ? 'text-indigo-600' : 'text-gray-300'}`} />
                        </div>
                    ))
                )}
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
                <button className="text-xs text-indigo-600 font-bold uppercase tracking-wider hover:underline">
                    + Agregar Vehículo
                </button>
            </div>
        </div>
    );
};

export default VehicleList;
