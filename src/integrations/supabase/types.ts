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
          muscle_groups: string[] | null
          name: string
          phone: string | null
          points: number | null
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
          muscle_groups?: string[] | null
          name: string
          phone?: string | null
          points?: number | null
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
          muscle_groups?: string[] | null
          name?: string
          phone?: string | null
          points?: number | null
          spotify_playlist?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          weight?: number | null
          youtube_playlist?: string | null
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
      is_own_profile: { Args: { profile_id: string }; Returns: boolean }
      is_profile_handle_available: {
        Args: { handle_input: string; exclude_profile_id?: string | null }
        Returns: boolean
      }
      normalize_profile_handle: { Args: { input_text: string }; Returns: string }
      reserve_unique_profile_handle: {
        Args: { seed_input: string; exclude_profile_id?: string | null }
        Returns: string
      }
      search_profiles_by_handle: {
        Args: {
          query_text: string
          limit_count?: number | null
          exclude_profile_id?: string | null
        }
        Returns: {
          goal: string | null
          handle: string
          name: string
          profile_id: string
        }[]
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
