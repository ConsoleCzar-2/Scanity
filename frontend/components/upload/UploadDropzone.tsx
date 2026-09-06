'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import type { DocumentResponse } from '@/types/api';

interface UploadDropzoneProps {
  onUploadSuccess: (document: DocumentResponse) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onUploadSuccess, disabled = false }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndUpload = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate MIME type and file extension
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setErrorMessage(`"${file.name}" is not a PDF. Only .pdf files are accepted.`);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(
        `File exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB (${(file.size / (1024 * 1024)).toFixed(1)}MB provided).`
      );
      return;
    }

    try {
      setIsUploading(true);
      const response = await api.uploadDocument(file);
      setSuccessMessage(`"${response.original_filename}" queued for ingestion.`);
      onUploadSuccess({
        id: response.document_id,
        original_filename: response.original_filename,
        status: response.status,
        page_count: null,
        total_chunks: null,
        uploaded_at: new Date().toISOString(),
        processed_at: null,
      });

      // Auto-clear success message after 4s
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Check backend connection.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndUpload(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndUpload(file);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {/* Drop Target Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled && !isUploading && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        className={`border border-dashed rounded p-4 text-center transition-colors cursor-pointer select-none ${
          isDragging
            ? 'border-indigo-500 bg-[#1a2130]'
            : 'border-[#1c232f] hover:border-[#2a3547] bg-[#161c26]'
        } ${disabled || isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-col items-center justify-center gap-1.5">
          <div className="w-8 h-8 rounded bg-[#11151c] border border-[#222b3a] flex items-center justify-center text-slate-300">
            {isUploading ? (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4 text-slate-300" />
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-slate-200">
              {isUploading ? 'Uploading...' : 'Drop PDF or browse'}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              PDF • Max {MAX_FILE_SIZE_MB}MB
            </p>
          </div>
        </div>
      </div>

      {/* Error Message Alert */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-medium">Upload Error:</span> {errorMessage}
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 transition-colors ml-1 font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Success Message Alert */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 transition-colors ml-1 font-mono"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
