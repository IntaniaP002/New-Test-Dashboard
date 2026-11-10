import React from 'react';
import { Copy, AlertTriangle, X, Check, ArrowRight } from 'lucide-react';
import { OperationalRecord } from '../types';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmitAnyway: () => void;
  candidateData: {
    date: string;
    time: string;
    realPower: number;
    P1_7: number;
    P3_0: number;
    pr: number | null;
    nphr: number;
    T1_7?: number | null;
    nhSpeed?: number | null;
  };
  existingRecord: OperationalRecord;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirmSubmitAnyway,
  candidateData,
  existingRecord,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="duplicate-warning-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="duplicate-warning-modal"
        className="bg-white rounded-xl shadow-2xl border border-amber-300 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200 bg-amber-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
              <Copy className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Peringatan: Data Duplikat Terdeteksi
              </h3>
              <p className="text-xs text-amber-900 font-medium mt-0.5">
                Data yang akan Anda simpan sama persis dengan data yang sudah pernah diinput sebelumnya.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
          {/* Warning Message Box */}
          <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-lg text-amber-950 flex items-start gap-2.5 shadow-2xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-extrabold text-amber-950 text-xs">
                Perhatian: Jika dilanjutkan, data ini akan tercatat ganda (doubled)!
              </div>
              <p className="text-amber-900 leading-relaxed text-[11px]">
                Sistem mendeteksi bahwa tanggal, waktu, dan seluruh nilai parameter teknis operasional yang Anda masukkan <strong>sama persis (exact match)</strong> dengan rekaman yang sudah ada di database.
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="bg-slate-100/90 px-3.5 py-2 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
              <span>Perbandingan Parameter (Data Baru vs Data Tersimpan)</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                100% Identik
              </span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2 px-3">Parameter</th>
                  <th className="py-2 px-3 text-right bg-amber-50/50 text-amber-950">Data Baru (Input Saat Ini)</th>
                  <th className="py-2 px-3 text-right bg-slate-50 text-slate-700">Data Tersimpan di Sistem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">Tanggal &amp; Waktu</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.date} {candidateData.time}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.date} {existingRecord.time || '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">Real Power (Beban)</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.realPower.toFixed(2)} MW
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.realPower.toFixed(2)} MW
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">P1.7 / PT006 (Inlet)</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.P1_7.toFixed(2)} PSIA
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.P1_7.toFixed(2)} PSIA
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">P3.0 / PT007 (Discharge)</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.P3_0.toFixed(2)} PSIA
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.P3_0.toFixed(2)} PSIA
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">Pressure Ratio (PR)</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.pr ? candidateData.pr.toFixed(4) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.pr ? existingRecord.pr.toFixed(4) : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-700">NPHR (Heat Rate)</td>
                  <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50/30">
                    {candidateData.nphr.toFixed(1)} kcal/kWh
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">
                    {existingRecord.nphr.toFixed(1)} kcal/kWh
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Apakah Anda ingin membatalkan untuk memeriksa kembali input Anda, atau tetap menyimpan data ini sebagai data ganda?
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
          >
            Batal &amp; Periksa Kembali
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirmSubmitAnyway();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors shadow-2xs cursor-pointer"
          >
            <span>Tetap Simpan (Simpan Data Ganda)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
