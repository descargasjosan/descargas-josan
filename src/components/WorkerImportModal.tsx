import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { WorkerImportData, ImportResult } from '../lib/types';
import { parseWorkerImportFile, importWorkersData } from '../lib/utils';

interface WorkerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (result: ImportResult) => void;
  currentWorkers: any[];
}

const WorkerImportModal: React.FC<WorkerImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  currentWorkers
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find((f: File) => 
      f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      f.type === 'application/vnd.ms-excel' ||
      f.type === 'text/csv' ||
      f.name.endsWith('.xlsx') ||
      f.name.endsWith('.xls') ||
      f.name.endsWith('.csv')
    );
    
    if (validFile) {
      setSelectedFile(validFile);
      setImportResult(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setImportResult(null);

    try {
      // Parsear el archivo
      const importData = await parseWorkerImportFile(selectedFile);
      
      if (importData.length === 0) {
        setImportResult({
          success: false,
          message: 'No se encontraron datos válidos en el archivo. Verifica que las columnas sean: Código, Nombre, Apellidos',
          updatedCount: 0,
          notFoundCodes: [],
          errors: ['El archivo no contiene datos de operarios válidos o el formato es incorrecto']
        });
        return;
      }

      // Importar datos
      const result = importWorkersData(importData, currentWorkers);
      setImportResult(result);

      if (result.success) {
        onImportComplete(result);
      }

    } catch (error) {
      console.error('Error en importación:', error);
      setImportResult({
        success: false,
        message: `Error al procesar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        updatedCount: 0,
        notFoundCodes: [],
        errors: [`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`]
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    try {
      const template = [
        ['Código', 'Nombre', 'Apellidos'],
        ['1', 'JOSE LUIS', 'RUIZ TARREGA'],
        ['2', 'VICENTE', 'GIL SANCHEZ'],
        ['3', 'JUAN JOSE', 'GONZALEZ MIRA']
      ];

      const ws = XLSX.utils.aoa_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      XLSX.writeFile(wb, 'plantilla_operarios.xlsx');
    } catch (error) {
      console.error('Error al descargar plantilla:', error);
      alert('Error al descargar la plantilla. Por favor, intenta crear manualmente un archivo con las columnas: Código, Nombre, Apellidos');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tighter">Importar Operarios</h2>
              <p className="text-sm text-slate-500">Actualiza nombres y apellidos masivamente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[60vh]">
          {!importResult ? (
            <>
              {/* Instructions */}
              <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-900 mb-2">Instrucciones importantes</h3>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>• El archivo debe tener columnas: <strong>Código</strong>, <strong>Nombre</strong>, <strong>Apellidos</strong></li>
                      <li>• El código debe coincidir exactamente con los códigos existentes</li>
                      <li>• Formatos aceptados: Excel (.xlsx, .xls) y CSV</li>
                      <li>• Se actualizarán los operarios que coincidan por código</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Download Template */}
              <div className="mb-6">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors text-sm font-medium text-slate-700"
                >
                  <Download className="w-4 h-4" />
                  Descargar plantilla Excel
                </button>
              </div>

              {/* File Upload Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    isDragging ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} />
                  </div>
                  
                  <div>
                    <p className="font-medium text-slate-900 mb-1">
                      {selectedFile ? selectedFile.name : 'Arrastra tu archivo aquí'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedFile ? 'Archivo seleccionado' : 'o haz clic para seleccionar'}
                    </p>
                  </div>
                  
                  {!selectedFile && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Seleccionar archivo
                    </button>
                  )}
                  
                  {selectedFile && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
                    >
                      Cambiar archivo
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={!selectedFile || isProcessing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    'Importar datos'
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Results */
            <div className="space-y-6">
              <div className={`p-6 rounded-2xl border ${
                importResult.success
                  ? 'bg-green-50 border-green-100'
                  : 'bg-red-50 border-red-100'
              }`}>
                <div className="flex items-start gap-3">
                  {importResult.success ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h3 className={`font-bold mb-2 ${
                      importResult.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {importResult.success ? 'Importación completada' : 'Error en la importación'}
                    </h3>
                    <p className={`text-sm ${
                      importResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {importResult.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Details */}
              {importResult.updatedCount > 0 && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm font-medium text-blue-900">
                    ✓ {importResult.updatedCount} operarios actualizados correctamente
                  </p>
                </div>
              )}

              {importResult.notFoundCodes.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    Códigos no encontrados ({importResult.notFoundCodes.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {importResult.notFoundCodes.slice(0, 10).map(code => (
                      <span key={code} className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                        {code}
                      </span>
                    ))}
                    {importResult.notFoundCodes.length > 10 && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                        +{importResult.notFoundCodes.length - 10} más...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-sm font-medium text-red-900 mb-2">Errores:</p>
                  <ul className="text-sm text-red-800 space-y-1">
                    {importResult.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Close Button */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setImportResult(null);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                >
                  Reintentar
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkerImportModal;
