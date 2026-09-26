const MIGRATION = "supabase/migrations/20260926063242_sales_purchase_documents_terms_and_payments.sql";

// PostgREST can't find a function/column (schema cache), or Postgres itself can't.
const MISSING_SCHEMA_CODES = new Set(["PGRST202", "PGRST204", "42703", "42883"]);

/**
 * Turns a Supabase/Postgres error into a sentence for the form. The posting
 * functions already raise readable messages ("the due date can't be before the
 * issue date"); this capitalizes them and explains the one setup error people hit
 * when the latest migration hasn't been applied yet.
 */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) {
    return `The database is missing the latest update (${MIGRATION}). Apply that migration in Supabase, then try again.`;
  }
  const message = error.message.replace(/^ERROR:\s*/i, "").trim();
  return message.charAt(0).toUpperCase() + message.slice(1);
}
