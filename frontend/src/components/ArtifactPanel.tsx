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
  Layers,
  Image as ImageIcon,
  Copy,
  Check,
  Plus,
  Calculator,
  ChevronLeft,
  ChevronRight
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

  // Editable Spreadsheet Studio State
  const [editableRows, setEditableRows] = useState<string[][]>([]);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [formulaValue, setFormulaValue] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

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
      setActiveSlideIdx(0);
      const data = await api.previewArtifact(sessionId, filename);
      setPreviewData(data);

      // Initialize editable rows for spreadsheet studio
      if (data.type === 'xlsx' && data.sheets && data.sheets.length > 0) {
        setEditableRows(data.sheets[0].rows || []);
      } else if (data.type === 'csv' && data.rows) {
        setEditableRows(data.rows || []);
      } else {
        setEditableRows([]);
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreviewError(`Unable to preview ${filename}. Please download instead.`);
      setTimeout(() => setPreviewError(null), 4000);
    }
  };

  const evaluateFormula = (val: string): string => {
    if (!val || !val.startsWith('=')) return val;
    const expr = val.slice(1).trim().toUpperCase();
    try {
      if (expr.startsWith('SUM(') && expr.endsWith(')')) {
        const inner = expr.slice(4, -1);
        const nums = inner.split(/[,:]/).map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
        return nums.reduce((a, b) => a + b, 0).toString();
      }
      if (expr.startsWith('AVG(') || expr.startsWith('AVERAGE(')) {
        const inner = expr.replace(/^AVERAGE\(/, '').replace(/^AVG\(/, '').replace(/\)$/, '');
        const nums = inner.split(/[,:]/).map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
        return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '0';
      }
      // Simple math
      if (/^[0-9+\-*/. ()]+$/.test(expr)) {
        // eslint-disable-next-line no-eval
        return Function(`'use strict'; return (${expr})`)().toString();
      }
      return val;
    } catch {
      return '#VALUE!';
    }
  };

  const handleCellChange = (rIdx: number, cIdx: number, newVal: string) => {
    setEditableRows((prev) => {
      const next = prev.map((r, ri) => (ri === rIdx ? [...r] : r));
      if (next[rIdx]) {
        next[rIdx][cIdx] = newVal;
      }
      return next;
    });
  };

  const handleAddRow = () => {
    setEditableRows((prev) => {
      const numCols = prev[0]?.length || 4;
      const newRow = Array(numCols).fill('');
      return [...prev, newRow];
    });
  };

  const handleAddColumn = () => {
    setEditableRows((prev) => prev.map((row, idx) => [...row, idx === 0 ? `Col ${row.length + 1}` : '']));
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Deliverables & Artifacts Studio
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
                  title="Interactive Studio Preview"
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

      {/* Interactive Artifact Studio Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-[0_24px_70px_rgba(0,0,0,0.9)] animate-springEnter">
            {/* Modal Header */}
            <div className="p-3.5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-2">
                {getFileIcon(previewData.type)}
                <h4 className="text-xs font-bold text-white font-mono">{previewData.filename}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase font-mono">
                  {previewData.type} Studio
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
              {/* 1. Spreadsheets: Interactive XLSX & CSV Studio */}
              {(previewData.type === 'xlsx' || previewData.type === 'csv') && editableRows.length > 0 && (
                <div className="space-y-3">
                  {/* Multi-Sheet Tabs for XLSX */}
                  {previewData.type === 'xlsx' && previewData.sheets && previewData.sheets.length > 1 && (
                    <div className="flex gap-1.5 border-b border-white/[0.06] pb-2">
                      {previewData.sheets.map((sheet, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveSheetIdx(idx);
                            setEditableRows(sheet.rows || []);
                          }}
                          className={`px-3 py-1 text-xs rounded-lg transition font-medium ${
                            activeSheetIdx === idx
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                          }`}
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Toolbar */}
                  <div className="flex items-center justify-between bg-[#121217] p-2 rounded-xl border border-white/[0.06]">
                    <div className="flex items-center gap-2 flex-1">
                      <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {activeCell ? `R${activeCell.r + 1}C${activeCell.c + 1}` : 'Formula'}:
                      </span>
                      <input
                        type="text"
                        value={formulaValue}
                        onChange={(e) => {
                          setFormulaValue(e.target.value);
                          if (activeCell) {
                            handleCellChange(activeCell.r, activeCell.c, e.target.value);
                          }
                        }}
                        placeholder="Type value or formula (e.g. =SUM(10, 20) or =150*1.2)"
                        className="bg-black/50 border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white focus:outline-none flex-1 font-mono tracking-tight"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <button
                        onClick={handleAddRow}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Row</span>
                      </button>
                      <button
                        onClick={handleAddColumn}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Col</span>
                      </button>
                    </div>
                  </div>

                  {/* Spreadsheet Grid */}
                  <div className="overflow-x-auto border border-white/[0.08] rounded-xl shadow-inner max-h-[55vh]">
                    <table className="min-w-full divide-y divide-white/[0.06] text-left text-xs font-mono">
                      <thead className="bg-[#14141a] text-zinc-300 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-2 border-r border-white/[0.06] w-10 text-center text-zinc-500 bg-[#0d0d12]">#</th>
                          {editableRows[0].map((cell, cIdx) => (
                            <th key={cIdx} className="px-3 py-2 border-r border-white/[0.06] font-semibold text-emerald-400 min-w-[120px]">
                              {cell || `Col ${cIdx + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04] bg-[#09090c]">
                        {editableRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-white/[0.02]">
                            <td className="px-2 py-1.5 border-r border-white/[0.06] text-center text-zinc-600 bg-[#0d0d12] select-none text-[10px]">
                              {rIdx + 1}
                            </td>
                            {row.map((val, cIdx) => {
                              const computed = evaluateFormula(val);
                              const isSelected = activeCell?.r === rIdx + 1 && activeCell?.c === cIdx;
                              return (
                                <td
                                  key={cIdx}
                                  onClick={() => {
                                    setActiveCell({ r: rIdx + 1, c: cIdx });
                                    setFormulaValue(val);
                                  }}
                                  className={`px-3 py-1.5 border-r border-white/[0.04] whitespace-nowrap cursor-pointer transition ${
                                    isSelected
                                      ? 'bg-emerald-500/20 text-white ring-1 ring-emerald-400'
                                      : 'text-zinc-300 hover:bg-white/[0.04]'
                                  }`}
                                >
                                  {computed}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Slide Presentations: Interactive PPTX Carousel Player */}
              {previewData.type === 'pptx' && previewData.slides && previewData.slides.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-[#101016] border border-white/[0.08] rounded-2xl p-8 min-h-[360px] flex flex-col justify-between shadow-2xl relative">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Slide {previewData.slides[activeSlideIdx].index} of {previewData.slides.length}
                        </span>
                        <Layers className="w-4 h-4 text-zinc-500" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-4">
                        {previewData.slides[activeSlideIdx].title}
                      </h3>
                      <ul className="space-y-3 text-sm text-zinc-200">
                        {previewData.slides[activeSlideIdx].content.map((point, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-2.5">
                            <span className="text-amber-400 font-bold">•</span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Slide Navigation Buttons */}
                    <div className="flex items-center justify-between pt-6 border-t border-white/[0.06] mt-6">
                      <button
                        disabled={activeSlideIdx === 0}
                        onClick={() => setActiveSlideIdx((prev) => Math.max(0, prev - 1))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 disabled:pointer-events-none text-xs font-medium text-white transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous Slide</span>
                      </button>

                      <div className="flex gap-1">
                        {previewData.slides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveSlideIdx(i)}
                            className={`w-2.5 h-2.5 rounded-full transition ${
                              activeSlideIdx === i ? 'bg-amber-400 scale-125' : 'bg-white/20 hover:bg-white/40'
                            }`}
                          />
                        ))}
                      </div>

                      <button
                        disabled={activeSlideIdx === previewData.slides.length - 1}
                        onClick={() => setActiveSlideIdx((prev) => Math.min(previewData.slides!.length - 1, prev + 1))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 disabled:pointer-events-none text-xs font-medium text-white transition"
                      >
                        <span>Next Slide</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Word Documents: DOCX */}
              {previewData.type === 'docx' && (previewData.sections || previewData.tables) && (
                <div className="space-y-4 max-w-3xl mx-auto p-6 bg-[#0e0e12] rounded-2xl border border-white/[0.08] shadow-xl">
                  {previewData.sections?.map((sec, idx) => (
                    <div key={idx}>
                      {sec.is_heading ? (
                        <h3 className="text-lg font-bold text-white mt-5 mb-2 pb-1.5 border-b border-white/[0.08]">
                          {sec.text}
                        </h3>
                      ) : (
                        <p className="text-zinc-300 my-1.5 leading-relaxed text-sm">
                          {sec.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Code & Markdown Studio with Syntax Highlighting & Copy */}
              {!['xlsx', 'csv', 'docx', 'pptx', 'image', 'pdf'].includes(previewData.type) && (
                <div className="relative font-mono text-xs rounded-2xl border border-white/[0.08] bg-[#050508] overflow-hidden shadow-2xl">
                  <div className="h-9 px-4 bg-[#111116] border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-mono">{previewData.filename}</span>
                    <button
                      onClick={() => handleCopyCode(previewData.content || '')}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-xs transition"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-4 text-zinc-200 overflow-x-auto leading-relaxed select-text">
                    {previewData.content}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
