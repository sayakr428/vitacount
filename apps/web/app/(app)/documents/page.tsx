import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { DocumentUploadDropzone } from "@/components/document-upload-dropzone";
import { DocumentListClient } from "./document-list-client";

export default async function DocumentsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();

  // Fetch Documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  // Fetch Accounts for category selection
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type")
    .eq("tenant_id", activeTenantId)
    .order("code", { ascending: true });

  // Fetch Agent Actions for AP Bookkeeping Agent
  const { data: agentActions } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .eq("agent_name", "ap_bookkeeping_agent")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Document & Receipt Capture (OCR)</h1>
          <p className="text-xs text-muted-foreground">
            Upload receipts, invoices, and expense documents. AP Bookkeeping Agent extracts key fields for human verification.
          </p>
        </div>
      </div>

      {/* Upload Dropzone */}
      <DocumentUploadDropzone />

      {/* Document List & Verification Workspace */}
      <DocumentListClient
        documents={documents || []}
        accounts={accounts || []}
        agentActions={agentActions || []}
      />
    </div>
  );
}
