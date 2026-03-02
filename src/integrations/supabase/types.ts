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
      challenges: {
        Row: {
          category: string | null
          challenge_type: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          points_awarded: number | null
          points_deducted: number | null
          target_value: number | null
        }
        Insert: {
          category?: string | null
          challenge_type: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_awarded?: number | null
          points_deducted?: number | null
          target_value?: number | null
        }
        Update: {
          category?: string | null
          challenge_type?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_awarded?: number | null
          points_deducted?: number | null
          target_value?: number | null
        }
        Relationships: []
      }
      client_diet_plans: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          plan_data: Json
          professional_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          plan_data?: Json
          professional_id: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          plan_data?: Json
          professional_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_feature_flags: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          source_order_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          source_order_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          source_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_feature_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_feature_flags_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workout_plans: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          plan_data: Json
          professional_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          plan_data?: Json
          professional_id: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          plan_data?: Json
          professional_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      manual_pix_proofs: {
        Row: {
          created_at: string
          file_path: string
          id: string
          order_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          order_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          order_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_pix_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_pix_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_pix_proofs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          paid_at: string | null
          pix_copy_paste: string | null
          pix_qr_image_url: string | null
          product_key: string
          professional_id: string | null
          provider: string
          provider_reference: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_image_url?: string | null
          product_key: string
          professional_id?: string | null
          provider: string
          provider_reference?: string | null
          status: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_image_url?: string | null
          product_key?: string
          professional_id?: string | null
          provider?: string
          provider_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_settings: {
        Row: {
          active_provider: string
          id: boolean
          manual_pix_copy_paste: string | null
          manual_pix_display_name: string | null
          manual_pix_instructions: string | null
          manual_pix_key: string | null
          updated_at: string
        }
        Insert: {
          active_provider?: string
          id?: boolean
          manual_pix_copy_paste?: string | null
          manual_pix_display_name?: string | null
          manual_pix_instructions?: string | null
          manual_pix_key?: string | null
          updated_at?: string
        }
        Update: {
          active_provider?: string
          id?: boolean
          manual_pix_copy_paste?: string | null
          manual_pix_display_name?: string | null
          manual_pix_instructions?: string | null
          manual_pix_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          client_id: string | null
          currency: string
          id: string
          owner_id: string | null
          price_cents: number
          product_key: string
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id?: string | null
          currency?: string
          id?: string
          owner_id?: string | null
          price_cents: number
          product_key: string
          scope: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string | null
          currency?: string
          id?: string
          owner_id?: string | null
          price_cents?: number
          product_key?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_client_links: {
        Row: {
          client_id: string
          created_at: string
          id: string
          professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          birthdate: string | null
          created_at: string | null
          email: string
          goal: string | null
          handle: string
          height: number | null
          id: string
          is_admin: boolean
          muscle_groups: string[] | null
          name: string
          phone: string | null
          points: number | null
          professional_subscription_active: boolean
          profile_type: string
          spotify_playlist: string | null
          training_frequency: number | null
          updated_at: string | null
          weight: number | null
          youtube_playlist: string | null
        }
        Insert: {
          age?: number | null
          birthdate?: string | null
          created_at?: string | null
          email: string
          goal?: string | null
          handle: string
          height?: number | null
          id: string
          is_admin?: boolean
          muscle_groups?: string[] | null
          name: string
          phone?: string | null
          points?: number | null
          professional_subscription_active?: boolean
          profile_type?: string
          spotify_playlist?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          weight?: number | null
          youtube_playlist?: string | null
        }
        Update: {
          age?: number | null
          birthdate?: string | null
          created_at?: string | null
          email?: string
          goal?: string | null
          handle?: string
          height?: number | null
          id?: string
          is_admin?: boolean
          muscle_groups?: string[] | null
          name?: string
          phone?: string | null
          points?: number | null
          professional_subscription_active?: boolean
          profile_type?: string
          spotify_playlist?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          weight?: number | null
          youtube_playlist?: string | null
        }
        Relationships: []
      }
      run_sessions: {
        Row: {
          avg_speed: number | null
          calories: number | null
          distance: number
          duration: number
          id: string
          recorded_at: string | null
          route: Json | null
          user_id: string
        }
        Insert: {
          avg_speed?: number | null
          calories?: number | null
          distance: number
          duration: number
          id?: string
          recorded_at?: string | null
          route?: Json | null
          user_id: string
        }
        Update: {
          avg_speed?: number | null
          calories?: number | null
          distance?: number
          duration?: number
          id?: string
          recorded_at?: string | null
          route?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      social_global_state: {
        Row: {
          chat_events: Json
          created_at: string
          feed_posts: Json
          friend_requests: Json
          id: boolean
          stories: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chat_events?: Json
          created_at?: string
          feed_posts?: Json
          friend_requests?: Json
          id?: boolean
          stories?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chat_events?: Json
          created_at?: string
          feed_posts?: Json
          friend_requests?: Json
          id?: boolean
          stories?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_challenge_progress: {
        Row: {
          assigned_date: string
          challenge_id: string
          completed_at: string | null
          created_at: string | null
          current_value: number | null
          id: string
          is_completed: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_date?: string
          challenge_id: string
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_date?: string
          challenge_id?: string
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_history: {
        Row: {
          id: string
          recorded_at: string | null
          user_id: string
          weight: number
        }
        Insert: {
          id?: string
          recorded_at?: string | null
          user_id: string
          weight: number
        }
        Update: {
          id?: string
          recorded_at?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_effective_product_price: {
        Args: { p_product_key: string; p_professional_id?: string }
        Returns: {
          currency: string
          price_cents: number
          pricing_rule_id: string
          product_key: string
          source_client_id: string
          source_owner_id: string
          source_scope: string
        }[]
      }
      has_active_professional_subscription: {
        Args: { target_profile_id?: string }
        Returns: boolean
      }
      has_professional_client_link: {
        Args: { client_uuid: string; professional_uuid: string }
        Returns: boolean
      }
      is_admin: { Args: { target_profile_id?: string }; Returns: boolean }
      is_nutritionist: {
        Args: { target_profile_id?: string }
        Returns: boolean
      }
      is_own_profile: { Args: { profile_id: string }; Returns: boolean }
      is_personal_trainer: {
        Args: { target_profile_id?: string }
        Returns: boolean
      }
      is_professional: {
        Args: { target_profile_id?: string }
        Returns: boolean
      }
      is_profile_handle_available: {
        Args: { exclude_profile_id?: string; handle_input: string }
        Returns: boolean
      }
      link_client_by_handle: {
        Args: { client_handle_input: string }
        Returns: {
          client_handle: string
          client_id: string
          client_name: string
          link_id: string
        }[]
      }
      mark_order_paid_and_apply_effects: {
        Args: { p_order_id: string; p_paid_at?: string }
        Returns: boolean
      }
      normalize_profile_handle: {
        Args: { input_text: string }
        Returns: string
      }
      reserve_unique_profile_handle: {
        Args: { exclude_profile_id?: string; seed_input: string }
        Returns: string
      }
      resolve_order_price: {
        Args: {
          p_client_id: string
          p_product_key: string
          p_professional_id?: string
        }
        Returns: {
          currency: string
          price_cents: number
          pricing_rule_id: string
          source_client_id: string
          source_owner_id: string
          source_scope: string
        }[]
      }
      search_client_profiles: {
        Args: { limit_count?: number; query_text: string }
        Returns: {
          already_linked: boolean
          goal: string
          handle: string
          name: string
          profile_id: string
        }[]
      }
      search_profiles_by_handle: {
        Args: {
          exclude_profile_id?: string
          limit_count?: number
          query_text: string
        }
        Returns: {
          goal: string
          handle: string
          name: string
          profile_id: string
        }[]
      }
      upsert_client_feature_flag: {
        Args: {
          p_client_id: string
          p_enabled?: boolean
          p_feature_key: string
          p_source_order_id?: string
        }
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
