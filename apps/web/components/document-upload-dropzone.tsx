"use client";

import { useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { uploadDocumentAction } from "@/lib/actions/documents";

export function DocumentUploadDropzone() {
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadDocumentAction(formData);
      setSuccessMsg(`Receipt "${file.name}" uploaded and extracted by AP Bookkeeping Agent!`);
      e.target.value = "";
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center shadow-xs transition-colors hover:border-primary/50">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>

        <h3 className="mb-1 text-base font-medium text-foreground">
          Upload Receipt or Invoice PDF/Image
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Drag & drop your files or click to browse. Claude Vision OCR will automatically extract financial details into a draft verification state.
        </p>

        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-transform active:scale-95 hover:bg-primary/90 disabled:opacity-50">
          <span>{isUploading ? "Extracting with Vision OCR..." : "Select Document"}</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={isUploading}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {successMsg && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-positive">
            <CheckCircle2 className="h-4 w-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <p className="mt-3 text-xs text-destructive">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
