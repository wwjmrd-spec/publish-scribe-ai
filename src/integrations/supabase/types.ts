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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_reviews: {
        Row: {
          article_id: string
          content_score: number | null
          detailed_feedback: Json | null
          grammar_score: number | null
          id: string
          overall_score: number | null
          plagiarism_score: number | null
          review_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          summary: string | null
        }
        Insert: {
          article_id: string
          content_score?: number | null
          detailed_feedback?: Json | null
          grammar_score?: number | null
          id?: string
          overall_score?: number | null
          plagiarism_score?: number | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string | null
        }
        Update: {
          article_id?: string
          content_score?: number | null
          detailed_feedback?: Json | null
          grammar_score?: number | null
          id?: string
          overall_score?: number | null
          plagiarism_score?: number | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_reviews_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          abstract: string | null
          author_id: string
          author_name: string | null
          certificate_url: string | null
          country: string | null
          created_at: string | null
          document_url: string | null
          formatted_document_url: string | null
          formatting_approved_at: string | null
          formatting_status: string | null
          formatting_suggestions: Json | null
          id: string
          issue: string | null
          keywords: string[] | null
          page_number: string | null
          publication_type: string
          publication_year: string | null
          published_link: string | null
          reason_of_research: string | null
          reference_number: string
          review_report_url: string | null
          status: Database["public"]["Enums"]["article_status"] | null
          subject: string | null
          submission_date: string | null
          submission_target: string | null
          title: string
          updated_at: string | null
          volume: string | null
        }
        Insert: {
          abstract?: string | null
          author_id: string
          author_name?: string | null
          certificate_url?: string | null
          country?: string | null
          created_at?: string | null
          document_url?: string | null
          formatted_document_url?: string | null
          formatting_approved_at?: string | null
          formatting_status?: string | null
          formatting_suggestions?: Json | null
          id?: string
          issue?: string | null
          keywords?: string[] | null
          page_number?: string | null
          publication_type?: string
          publication_year?: string | null
          published_link?: string | null
          reason_of_research?: string | null
          reference_number: string
          review_report_url?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          subject?: string | null
          submission_date?: string | null
          submission_target?: string | null
          title: string
          updated_at?: string | null
          volume?: string | null
        }
        Update: {
          abstract?: string | null
          author_id?: string
          author_name?: string | null
          certificate_url?: string | null
          country?: string | null
          created_at?: string | null
          document_url?: string | null
          formatted_document_url?: string | null
          formatting_approved_at?: string | null
          formatting_status?: string | null
          formatting_suggestions?: Json | null
          id?: string
          issue?: string | null
          keywords?: string[] | null
          page_number?: string | null
          publication_type?: string
          publication_year?: string | null
          published_link?: string | null
          reason_of_research?: string | null
          reference_number?: string
          review_report_url?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          subject?: string | null
          submission_date?: string | null
          submission_target?: string | null
          title?: string
          updated_at?: string | null
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          ai_response: string | null
          created_at: string
          description: string | null
          error_stack: string | null
          id: string
          page_url: string | null
          resolved_at: string | null
          status: string
          title: string
          type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          description?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          type?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          description?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      co_author_certificates: {
        Row: {
          amount_paid: number | null
          article_id: string
          certificate_url: string | null
          co_author_id: string
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"] | null
          id: string
          payment_id: string | null
          payment_status:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Insert: {
          amount_paid?: number | null
          article_id: string
          certificate_url?: string | null
          co_author_id: string
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          payment_id?: string | null
          payment_status?:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Update: {
          amount_paid?: number | null
          article_id?: string
          certificate_url?: string | null
          co_author_id?: string
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          payment_id?: string | null
          payment_status?:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "co_author_certificates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_author_certificates_co_author_id_fkey"
            columns: ["co_author_id"]
            isOneToOne: false
            referencedRelation: "co_authors"
            referencedColumns: ["id"]
          },
        ]
      }
      co_authors: {
        Row: {
          affiliation: string | null
          article_id: string
          created_at: string | null
          email: string
          id: string
          name: string
        }
        Insert: {
          affiliation?: string | null
          article_id: string
          created_at?: string | null
          email: string
          id?: string
          name: string
        }
        Update: {
          affiliation?: string | null
          article_id?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "co_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id: string
          is_active: boolean | null
          start_date: string
          usage_limit: number | null
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id?: string
          is_active?: boolean | null
          start_date: string
          usage_limit?: number | null
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          currency?: Database["public"]["Enums"]["discount_currency"]
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          end_date?: string
          id?: string
          is_active?: boolean | null
          start_date?: string
          usage_limit?: number | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          article_id: string
          id: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          article_id: string
          id?: string
          reminder_type?: string
          sent_at?: string
        }
        Update: {
          article_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          article_ids: string[]
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"]
          discount_amount: number | null
          discount_code: string | null
          final_amount: number
          id: string
          payment_gateway: Database["public"]["Enums"]["payment_gateway"]
          payment_items: Json | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          article_ids: string[]
          created_at?: string | null
          currency: Database["public"]["Enums"]["currency_type"]
          discount_amount?: number | null
          discount_code?: string | null
          final_amount: number
          id?: string
          payment_gateway: Database["public"]["Enums"]["payment_gateway"]
          payment_items?: Json | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          article_ids?: string[]
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"]
          discount_amount?: number | null
          discount_code?: string | null
          final_amount?: number
          id?: string
          payment_gateway?: Database["public"]["Enums"]["payment_gateway"]
          payment_items?: Json | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_usage: {
        Row: {
          coauthor_certs_used: number
          id: string
          review_reports_used: number
          updated_at: string
          usage_month: string
          user_id: string
        }
        Insert: {
          coauthor_certs_used?: number
          id?: string
          review_reports_used?: number
          updated_at?: string
          usage_month: string
          user_id: string
        }
        Update: {
          coauthor_certs_used?: number
          id?: string
          review_reports_used?: number
          updated_at?: string
          usage_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliation: string | null
          avatar_url: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_indian: boolean | null
          referral_code: string | null
        }
        Insert: {
          affiliation?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_indian?: boolean | null
          referral_code?: string | null
        }
        Update: {
          affiliation?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_indian?: boolean | null
          referral_code?: string | null
        }
        Relationships: []
      }
      publication_fees: {
        Row: {
          binance_wallet_address: string | null
          id: string
          indian_coauthor_fee: number | null
          indian_fast_track_fee: number | null
          indian_fee: number | null
          indian_pro_fee: number | null
          international_coauthor_fee: number | null
          international_fast_track_fee: number | null
          international_fee: number | null
          international_pro_fee: number | null
          updated_at: string | null
          updated_by: string | null
          usdt_coauthor_fee: number | null
          usdt_fast_track_fee: number | null
          usdt_fee: number | null
          usdt_pro_fee: number | null
        }
        Insert: {
          binance_wallet_address?: string | null
          id?: string
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Update: {
          binance_wallet_address?: string | null
          id?: string
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_fees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_granted: boolean
          rewarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_granted?: boolean
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_granted?: boolean
          rewarded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          frequency_hours: number
          id: string
          max_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          frequency_hours?: number
          id?: string
          max_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          frequency_hours?: number
          id?: string
          max_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          payment_id: string | null
          plan_type: string
          starts_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          payment_id?: string | null
          plan_type?: string
          starts_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          payment_id?: string | null
          plan_type?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      article_status:
        | "submitted"
        | "under_review"
        | "manuscript_accepted"
        | "pending_fee"
        | "paid"
        | "payment_under_review"
        | "failed_payment"
        | "published"
        | "rejected"
      coauthor_payment_status: "pending" | "paid" | "failed"
      currency_type: "INR" | "USD" | "USDT"
      discount_currency: "INR" | "USD" | "BOTH" | "USDT"
      discount_type: "percentage" | "fixed"
      payment_gateway: "razorpay" | "paypal" | "binance" | "manual"
      payment_status: "pending" | "success" | "failed" | "under_review"
      user_role: "author" | "admin"
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
    Enums: {
      article_status: [
        "submitted",
        "under_review",
        "manuscript_accepted",
        "pending_fee",
        "paid",
        "payment_under_review",
        "failed_payment",
        "published",
        "rejected",
      ],
      coauthor_payment_status: ["pending", "paid", "failed"],
      currency_type: ["INR", "USD", "USDT"],
      discount_currency: ["INR", "USD", "BOTH", "USDT"],
      discount_type: ["percentage", "fixed"],
      payment_gateway: ["razorpay", "paypal", "binance", "manual"],
      payment_status: ["pending", "success", "failed", "under_review"],
      user_role: ["author", "admin"],
    },
  },
} as const
