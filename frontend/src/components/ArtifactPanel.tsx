import React, { useState } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  Download, 
  Eye, 
  X,
  PackageCheck
} from 'lucide-react';
import type { Artifact } from '../types';
import { api } from '../services/api';

interface ArtifactPanelProps {
  artifacts: Artifact[];
  sessionId: string;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifacts, sessionId }) => {
  const [previewData, setPreviewData] = useState<{ filename: string; content: string; type: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
      default:
        return <FileCode className="w-5 h-5 text-purple-400" />;
    }
  };

  const handlePreview = async (filename: string) => {
    try {
      setPreviewError(null);
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-scaleIn">
            <div className="p-3.5 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-semibold text-white font-mono">{previewData.filename}</h4>
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

            <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117] font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">
              {previewData.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
