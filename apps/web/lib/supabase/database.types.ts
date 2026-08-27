export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          subtype: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          subtype?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          subtype?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          account_id: string | null
          amount: number
          bill_id: string
          description: string | null
          id: string
          item_id: string | null
          quantity: number | null
          sort_order: number
          unit_cost: number | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          bill_id: string
          description?: string | null
          id?: string
          item_id?: string | null
          quantity?: number | null
          sort_order?: number
          unit_cost?: number | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          bill_id?: string
          description?: string | null
          id?: string
          item_id?: string | null
          quantity?: number | null
          sort_order?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payment_applications: {
        Row: {
          amount_applied: number
          bill_id: string
          id: string
          payment_id: string
        }
        Insert: {
          amount_applied: number
          bill_id: string
          id?: string
          payment_id: string
        }
        Update: {
          amount_applied?: number
          bill_id?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payment_applications_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payment_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_made"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          balance_due: number
          bill_number: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          issue_date: string
          project_id: string | null
          source_document_id: string | null
          status: string
          tenant_id: string
          total: number
          vendor_id: string
        }
        Insert: {
          balance_due?: number
          bill_number?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          issue_date: string
          project_id?: string | null
          source_document_id?: string | null
          status?: string
          tenant_id: string
          total?: number
          vendor_id: string
        }
        Update: {
          balance_due?: number
          bill_number?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          project_id?: string | null
          source_document_id?: string | null
          status?: string
          tenant_id?: string
          total?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          billing_address: Json | null
          created_at: string
          credit_limit: number | null
          display_name: string
          email: string | null
          id: string
          is_1099_vendor: boolean
          payment_terms: string
          phone: string | null
          shipping_address: Json | null
          tax_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string
          credit_limit?: number | null
          display_name: string
          email?: string | null
          id?: string
          is_1099_vendor?: boolean
          payment_terms?: string
          phone?: string | null
          shipping_address?: Json | null
          tax_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          billing_address?: Json | null
          created_at?: string
          credit_limit?: number | null
          display_name?: string
          email?: string | null
          id?: string
          is_1099_vendor?: boolean
          payment_terms?: string
          phone?: string | null
          shipping_address?: Json | null
          tax_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_types: {
        Row: {
          id: string
          is_active: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_values: {
        Row: {
          dimension_type_id: string
          id: string
          is_active: boolean
          tenant_id: string
          value: string
        }
        Insert: {
          dimension_type_id: string
          id?: string
          is_active?: boolean
          tenant_id: string
          value: string
        }
        Update: {
          dimension_type_id?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_values_dimension_type_id_fkey"
            columns: ["dimension_type_id"]
            isOneToOne: false
            referencedRelation: "dimension_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          description: string | null
          id: string
          invoice_id: string
          item_id: string | null
          quantity: number
          sort_order: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount: number
          description?: string | null
          id?: string
          invoice_id: string
          item_id?: string | null
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price: number
        }
        Update: {
          amount?: number
          description?: string | null
          id?: string
          invoice_id?: string
          item_id?: string | null
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_due: number
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          project_id: string | null
          status: string
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
        }
        Insert: {
          balance_due?: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          project_id?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
        }
        Update: {
          balance_due?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          project_id?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          memo: string | null
          period_id: string | null
          posted_at: string | null
          reversal_of_id: string | null
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          memo?: string | null
          period_id?: string | null
          posted_at?: string | null
          reversal_of_id?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          memo?: string | null
          period_id?: string | null
          posted_at?: string | null
          reversal_of_id?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_line_dimensions: {
        Row: {
          dimension_value_id: string
          journal_entry_line_id: string
        }
        Insert: {
          dimension_value_id: string
          journal_entry_line_id: string
        }
        Update: {
          dimension_value_id?: string
          journal_entry_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_line_dimensions_dimension_value_id_fkey"
            columns: ["dimension_value_id"]
            isOneToOne: false
            referencedRelation: "dimension_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_line_dimensions_journal_entry_line_id_fkey"
            columns: ["journal_entry_line_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          id: string
          journal_entry_id: string
          memo: string | null
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id: string
          memo?: string | null
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          id: string
          invited_at: string | null
          permissions: Json
          role: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          permissions?: Json
          role: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          permissions?: Json
          role?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_applications: {
        Row: {
          amount_applied: number
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount_applied: number
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount_applied?: number
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_received"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_made: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          payment_date: string
          scheduled_for: string | null
          tenant_id: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          payment_date: string
          scheduled_for?: string | null
          tenant_id: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          payment_date?: string
          scheduled_for?: string | null
          tenant_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_made_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_made_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_received: {
        Row: {
          amount: number
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          payment_date: string
          reference: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          payment_date: string
          reference?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          payment_date?: string
          reference?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_received_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          end_date: string
          id: string
          start_date: string
          status: string
          tenant_id: string
        }
        Insert: {
          end_date: string
          id?: string
          start_date: string
          status?: string
          tenant_id: string
        }
        Update: {
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          base_currency: string
          created_at: string
          default_tax_rate: number
          id: string
          name: string
          plan_tier: string
          settings: Json
        }
        Insert: {
          base_currency?: string
          created_at?: string
          default_tax_rate?: number
          id?: string
          name: string
          plan_tier?: string
          settings?: Json
        }
        Update: {
          base_currency?: string
          created_at?: string
          default_tax_rate?: number
          id?: string
          name?: string
          plan_tier?: string
          settings?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_vendor_payment: {
        Args: {
          p_amount: number
          p_applications: Json
          p_payment_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      accept_invite: { Args: { p_tenant_id: string }; Returns: undefined }
      create_bill_received: {
        Args: {
          p_bill_number: string
          p_due_date: string
          p_issue_date: string
          p_lines: Json
          p_tenant_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_tenant: { Args: { tenant_name: string }; Returns: string }
      current_admin_tenant_ids: { Args: never; Returns: string[] }
      current_member_tenant_ids: { Args: never; Returns: string[] }
      current_tenant_ids: { Args: never; Returns: string[] }
      execute_scheduled_vendor_payment: {
        Args: { p_applications: Json; p_payment_id: string }
        Returns: undefined
      }
      lookup_user_id_by_email: { Args: { p_email: string }; Returns: string }
      next_invoice_number: { Args: { p_tenant_id: string }; Returns: string }
      post_invoice_issued: { Args: { p_invoice_id: string }; Returns: string }
      post_manual_journal_entry: {
        Args: {
          p_entry_date: string
          p_lines: Json
          p_memo: string
          p_tenant_id: string
        }
        Returns: string
      }
      post_payment_received: {
        Args: {
          p_amount: number
          p_applications: Json
          p_contact_id: string
          p_method: string
          p_payment_date: string
          p_reference: string
          p_stripe_payment_intent_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      post_vendor_payment_made: {
        Args: {
          p_amount: number
          p_applications: Json
          p_method: string
          p_payment_date: string
          p_scheduled_for: string
          p_tenant_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      seed_default_chart_of_accounts: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
