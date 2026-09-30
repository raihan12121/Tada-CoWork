import React, { useState } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  Download, 
  Eye, 
  X,
  PackageCheck,
  Table as TableIcon,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import type { Artifact, ArtifactPreviewData } from '../types';
import { api } from '../services/api';

interface ArtifactPanelProps {
  artifacts: Artifact[];
  sessionId: string;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifacts, sessionId }) => {
  const [previewData, setPreviewData] = useState<ArtifactPreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'docx':
      case 'pdf':
        return <FileText className="w-4 h-4 text-cyan-400" />;
      case 'pptx':
        return <Presentation className="w-4 h-4 text-amber-400" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
        return <ImageIcon className="w-4 h-4 text-pink-400" />;
      default:
        return <FileCode className="w-4 h-4 text-purple-400" />;
    }
  };

  const handlePreview = async (filename: string) => {
    try {
      setPreviewError(null);
      setActiveSheetIdx(0);
      const data = await api.previewArtifact(sessionId, filename);
      setPreviewData(data);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreviewError(`Unable to preview ${filename}. Please download instead.`);
      setTimeout(() => setPreviewError(null), 4000);
    }
  };

  return (
    <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Deliverables & Artifacts
          </h3>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.08]">
          {artifacts.length}
        </span>
      </div>

      {previewError && (
        <div className="mb-3 p-2 bg-rose-950/30 border border-rose-500/40 rounded-lg text-xs text-rose-300">
          {previewError}
        </div>
      )}

      {artifacts.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-600 italic">
          Files generated during execution will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {artifacts.map((art) => (
            <div
              key={art.id}
              className="p-2.5 bg-[#0e0e12] border border-white/[0.06] hover:border-white/[0.16] rounded-xl transition flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-1.5 rounded-lg bg-black border border-white/[0.06]">
                  {getFileIcon(art.file_type)}
                </div>
                <div className="truncate">
                  <h5 className="text-xs font-medium text-white truncate group-hover:text-cyan-300 transition">
                    {art.name}
                  </h5>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {art.file_type.toUpperCase()} · {(art.file_size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handlePreview(art.name)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition"
                  title="Preview"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a
                  href={api.getArtifactDownloadUrl(sessionId, art.name)}
                  download={art.name}
                  className="p-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-white/[0.08] transition"
                  title="Download deliverable"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Artifact Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl animate-fadeIn">
            <div className="p-3.5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-2">
                {getFileIcon(previewData.type)}
                <h4 className="text-xs font-bold text-white font-mono">{previewData.filename}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase font-mono">
                  {previewData.type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={api.getArtifactDownloadUrl(sessionId, previewData.filename)}
                  download={previewData.filename}
                  className="inline-flex items-center gap-1 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-1 px-3 rounded-lg transition"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setPreviewData(null)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#09090c] text-xs leading-relaxed">
              {/* 1. Spreadsheets: XLSX */}
              {previewData.type === 'xlsx' && previewData.sheets && previewData.sheets.length > 0 && (
                <div className="space-y-3">
                  <div className="flex gap-1 border-b border-white/[0.06] pb-2">
                    {previewData.sheets.map((sheet, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSheetIdx(idx)}
                        className={`px-3 py-1 text-xs rounded-lg transition font-medium flex items-center gap-1.5 ${
                          activeSheetIdx === idx
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <TableIcon className="w-3 h-3" />
                        <span>{sheet.name}</span>
                      </button>
                    ))}
                  </div>

                  {previewData.sheets[activeSheetIdx]?.rows && previewData.sheets[activeSheetIdx].rows.length > 0 ? (
                    <div className="overflow-x-auto border border-white/[0.08] rounded-xl">
                      <table className="min-w-full divide-y divide-white/[0.06] text-left text-xs font-mono">
                        <thead className="bg-[#121216] text-zinc-300">
                          <tr>
                            {previewData.sheets[activeSheetIdx].rows[0].map((cell, cIdx) => (
                              <th key={cIdx} className="px-3 py-2 border-r border-white/[0.06] font-semibold text-emerald-400">
                                {cell || `Col ${cIdx + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] bg-[#09090c]">
                          {previewData.sheets[activeSheetIdx].rows.slice(1).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-white/[0.02]">
                              {row.map((val, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 border-r border-white/[0.04] text-zinc-300 whitespace-nowrap">
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-zinc-600 italic">Sheet is empty.</p>
                  )}
                </div>
              )}

              {/* 2. Spreadsheets: CSV */}
              {previewData.type === 'csv' && previewData.rows && previewData.rows.length > 0 && (
                <div className="overflow-x-auto border border-white/[0.08] rounded-xl">
                  <table className="min-w-full divide-y divide-white/[0.06] text-left text-xs font-mono">
                    <thead className="bg-[#121216] text-emerald-400 font-semibold">
                      <tr>
                        {previewData.rows[0].map((col, idx) => (
                          <th key={idx} className="px-3 py-2 border-r border-white/[0.06]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {previewData.rows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-white/[0.02]">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5 border-r border-white/[0.04] text-zinc-300 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 3. Word Documents: DOCX */}
              {previewData.type === 'docx' && (previewData.sections || previewData.tables) && (
                <div className="space-y-4 max-w-2xl mx-auto p-5 bg-[#0e0e12] rounded-xl border border-white/[0.08]">
                  {previewData.sections?.map((sec, idx) => (
                    <div key={idx}>
                      {sec.is_heading ? (
                        <h3 className="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-white/[0.08]">
                          {sec.text}
                        </h3>
                      ) : (
                        <p className="text-zinc-300 my-1 leading-relaxed">
                          {sec.text}
                        </p>
                      )}
                    </div>
                  ))}

                  {previewData.tables && previewData.tables.map((table, tIdx) => (
                    <div key={tIdx} className="mt-3 overflow-x-auto border border-white/[0.08] rounded-lg">
                      <table className="min-w-full divide-y divide-white/[0.06] text-xs font-mono">
                        <tbody>
                          {table.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? 'bg-white/[0.06] font-semibold text-white' : 'hover:bg-white/[0.02]'}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 border-r border-white/[0.06] text-zinc-300">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Slide Presentations: PPTX */}
              {previewData.type === 'pptx' && previewData.slides && previewData.slides.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewData.slides.map((slide) => (
                    <div key={slide.index} className="bg-[#0e0e12] border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] mb-3">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                            Slide {slide.index}
                          </span>
                          <Layers className="w-3.5 h-3.5 text-zinc-600" />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-2">{slide.title}</h4>
                        <ul className="space-y-1.5 text-xs text-zinc-300">
                          {slide.content.map((point, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-1.5">
                              <span className="text-amber-400 font-bold">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 5. Image view */}
              {previewData.type === 'image' && (
                <div className="flex flex-col items-center justify-center p-4">
                  <img
                    src={api.getArtifactDownloadUrl(sessionId, previewData.filename)}
                    alt={previewData.filename}
                    className="max-h-[60vh] max-w-full rounded-xl border border-white/[0.08] shadow-2xl object-contain"
                  />
                  <p className="mt-2 text-xs text-zinc-500 font-mono">{previewData.filename}</p>
                </div>
              )}

              {/* 6. PDF Embed / View */}
              {previewData.type === 'pdf' && (
                <div className="flex flex-col items-center justify-center p-8 space-y-4">
                  <FileText className="w-14 h-14 text-rose-400 animate-pulse" />
                  <div className="text-center">
                    <h4 className="text-sm font-bold text-white font-mono">{previewData.filename}</h4>
                    <p className="text-xs text-zinc-400 mt-1">{previewData.content}</p>
                  </div>
                  <a
                    href={api.getArtifactDownloadUrl(sessionId, previewData.filename)}
                    download={previewData.filename}
                    className="inline-flex items-center gap-2 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-2 px-4 rounded-xl shadow transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download & Open PDF</span>
                  </a>
                </div>
              )}

              {/* 7. Fallback Text / Code / Markdown */}
              {!['xlsx', 'csv', 'docx', 'pptx', 'image', 'pdf'].includes(previewData.type) && (
                <div className="font-mono text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed bg-black/60 p-4 rounded-xl border border-white/[0.06]">
                  {previewData.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
