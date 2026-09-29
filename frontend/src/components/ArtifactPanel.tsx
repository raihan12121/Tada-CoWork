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
        return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
      case 'docx':
      case 'pdf':
        return <FileText className="w-5 h-5 text-blue-400" />;
      case 'pptx':
        return <Presentation className="w-5 h-5 text-amber-400" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
        return <ImageIcon className="w-5 h-5 text-pink-400" />;
      default:
        return <FileCode className="w-5 h-5 text-purple-400" />;
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
      setPreviewError(`Unable to load preview for ${filename}. Click download instead.`);
      setTimeout(() => setPreviewError(null), 4000);
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 shadow-lg">
      <div className="flex items-center space-x-2 pb-3 border-b border-[#30363d] mb-3">
        <PackageCheck className="w-4 h-4 text-indigo-400" />
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          Deliverables & Artifacts ({artifacts.length})
        </h3>
      </div>

      {previewError && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-500/40 rounded-lg text-xs text-red-300">
          {previewError}
        </div>
      )}

      {artifacts.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-500 italic">
          No deliverables produced yet. Files generated during execution will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {artifacts.map((art) => (
            <div
              key={art.id}
              className="p-3 bg-[#0d1117] border border-[#30363d] hover:border-gray-500 rounded-lg transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3 min-w-0 pr-2">
                <div className="p-2 rounded-md bg-[#161b22]">
                  {getFileIcon(art.file_type)}
                </div>
                <div className="truncate">
                  <h5 className="text-xs font-medium text-white truncate group-hover:text-indigo-300">
                    {art.name}
                  </h5>
                  <p className="text-[10px] text-gray-500">
                    {art.file_type.toUpperCase()} · {(art.file_size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => handlePreview(art.name)}
                  className="p-1.5 rounded-md hover:bg-[#21262d] text-gray-400 hover:text-white transition"
                  title="Preview"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a
                  href={api.getArtifactDownloadUrl(sessionId, art.name)}
                  download={art.name}
                  className="p-1.5 rounded-md hover:bg-[#21262d] text-indigo-400 hover:text-indigo-300 transition"
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl animate-scaleIn">
            <div className="p-3.5 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {getFileIcon(previewData.type)}
                <h4 className="text-xs font-semibold text-white font-mono">{previewData.filename}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase font-mono">
                  {previewData.type}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={api.getArtifactDownloadUrl(sessionId, previewData.filename)}
                  download={previewData.filename}
                  className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-1 px-2.5 rounded transition"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setPreviewData(null)}
                  className="p-1 text-gray-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117] text-xs leading-relaxed">
              {/* 1. Spreadsheets: XLSX */}
              {previewData.type === 'xlsx' && previewData.sheets && previewData.sheets.length > 0 && (
                <div className="space-y-3">
                  {/* Sheet tabs */}
                  <div className="flex space-x-1 border-b border-[#30363d] pb-2">
                    {previewData.sheets.map((sheet, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSheetIdx(idx)}
                        className={`px-3 py-1 text-xs rounded-md transition font-medium flex items-center space-x-1.5 ${
                          activeSheetIdx === idx
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-[#161b22] text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <TableIcon className="w-3 h-3" />
                        <span>{sheet.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Active sheet table */}
                  {previewData.sheets[activeSheetIdx]?.rows && previewData.sheets[activeSheetIdx].rows.length > 0 ? (
                    <div className="overflow-x-auto border border-[#30363d] rounded-lg">
                      <table className="min-w-full divide-y divide-[#30363d] text-left text-xs font-mono">
                        <thead className="bg-[#161b22] text-gray-300">
                          <tr>
                            {previewData.sheets[activeSheetIdx].rows[0].map((cell, cIdx) => (
                              <th key={cIdx} className="px-3 py-2 border-r border-[#30363d] font-semibold text-emerald-400">
                                {cell || `Col ${cIdx + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#21262d] bg-[#0d1117]">
                          {previewData.sheets[activeSheetIdx].rows.slice(1).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-[#161b22]/60">
                              {row.map((val, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 border-r border-[#21262d] text-gray-300 whitespace-nowrap">
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">Sheet is empty.</p>
                  )}
                </div>
              )}

              {/* 2. Spreadsheets: CSV */}
              {previewData.type === 'csv' && previewData.rows && previewData.rows.length > 0 && (
                <div className="overflow-x-auto border border-[#30363d] rounded-lg">
                  <table className="min-w-full divide-y divide-[#30363d] text-left text-xs font-mono">
                    <thead className="bg-[#161b22] text-emerald-400 font-semibold">
                      <tr>
                        {previewData.rows[0].map((col, idx) => (
                          <th key={idx} className="px-3 py-2 border-r border-[#30363d]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#21262d]">
                      {previewData.rows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-[#161b22]/60">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5 border-r border-[#21262d] text-gray-300 whitespace-nowrap">
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
                <div className="space-y-4 max-w-2xl mx-auto p-4 bg-[#161b22] rounded-lg border border-[#30363d]">
                  {previewData.sections?.map((sec, idx) => (
                    <div key={idx}>
                      {sec.is_heading ? (
                        <h3 className="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-[#30363d]">
                          {sec.text}
                        </h3>
                      ) : (
                        <p className="text-gray-300 my-1 leading-relaxed">
                          {sec.text}
                        </p>
                      )}
                    </div>
                  ))}

                  {previewData.tables && previewData.tables.map((table, tIdx) => (
                    <div key={tIdx} className="mt-3 overflow-x-auto border border-[#30363d] rounded">
                      <table className="min-w-full divide-y divide-[#30363d] text-xs">
                        <tbody>
                          {table.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? 'bg-[#21262d] font-semibold text-white' : 'hover:bg-[#21262d]/40'}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 border-r border-[#30363d] text-gray-300">
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
                    <div key={slide.index} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-[#30363d] mb-3">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            Slide {slide.index}
                          </span>
                          <Layers className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-2">{slide.title}</h4>
                        <ul className="space-y-1.5 text-xs text-gray-300">
                          {slide.content.map((point, pIdx) => (
                            <li key={pIdx} className="flex items-start space-x-1.5">
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
                    className="max-h-[60vh] max-w-full rounded-lg border border-[#30363d] shadow-lg object-contain"
                  />
                  <p className="mt-2 text-xs text-gray-400 font-mono">{previewData.filename}</p>
                </div>
              )}

              {/* 6. PDF Embed / View */}
              {previewData.type === 'pdf' && (
                <div className="flex flex-col items-center justify-center p-6 space-y-4">
                  <FileText className="w-16 h-16 text-red-400 animate-pulse" />
                  <div className="text-center">
                    <h4 className="text-sm font-bold text-white font-mono">{previewData.filename}</h4>
                    <p className="text-xs text-gray-400 mt-1">{previewData.content}</p>
                  </div>
                  <a
                    href={api.getArtifactDownloadUrl(sessionId, previewData.filename)}
                    download={previewData.filename}
                    className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download & Open PDF</span>
                  </a>
                </div>
              )}

              {/* 7. Fallback Text / Code / Markdown */}
              {!['xlsx', 'csv', 'docx', 'pptx', 'image', 'pdf'].includes(previewData.type) && (
                <div className="font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">
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
