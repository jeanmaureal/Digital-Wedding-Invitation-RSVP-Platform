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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      wedding_settings: {
        Row: {
          access_mode: Database["public"]["Enums"]["wedding_access_mode"]
          allow_plus_ones_default: boolean
          contact_email: string | null
          created_at: string
          dress_code: string
          is_rsvp_open: boolean
          primary_locale: string
          rsvp_confirmation_message: string
          rsvp_deadline: string | null
          show_guest_dietary_notes: boolean
          timezone: string
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["wedding_access_mode"]
          allow_plus_ones_default?: boolean
          contact_email?: string | null
          created_at?: string
          dress_code?: string
          is_rsvp_open?: boolean
          primary_locale?: string
          rsvp_confirmation_message?: string
          rsvp_deadline?: string | null
          show_guest_dietary_notes?: boolean
          timezone?: string
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["wedding_access_mode"]
          allow_plus_ones_default?: boolean
          contact_email?: string | null
          created_at?: string
          dress_code?: string
          is_rsvp_open?: boolean
          primary_locale?: string
          rsvp_confirmation_message?: string
          rsvp_deadline?: string | null
          show_guest_dietary_notes?: boolean
          timezone?: string
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_settings_workspace_wedding_fkey"
            columns: ["workspace_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      weddings: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          duplicated_from_wedding_id: string | null
          event_date: string | null
          id: string
          partner_one_name: string
          partner_two_name: string
          slug: string
          status: Database["public"]["Enums"]["wedding_status"]
          title: string
          updated_at: string
          venue_location: string
          venue_name: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duplicated_from_wedding_id?: string | null
          event_date?: string | null
          id?: string
          partner_one_name: string
          partner_two_name: string
          slug: string
          status?: Database["public"]["Enums"]["wedding_status"]
          title: string
          updated_at?: string
          venue_location?: string
          venue_name?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duplicated_from_wedding_id?: string | null
          event_date?: string | null
          id?: string
          partner_one_name?: string
          partner_two_name?: string
          slug?: string
          status?: Database["public"]["Enums"]["wedding_status"]
          title?: string
          updated_at?: string
          venue_location?: string
          venue_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weddings_duplicated_from_wedding_id_fkey"
            columns: ["duplicated_from_wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_workspace_member_by_email: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_wedding: {
        Args: {
          p_access_mode?: Database["public"]["Enums"]["wedding_access_mode"]
          p_allow_plus_ones_default?: boolean
          p_contact_email?: string
          p_dress_code?: string
          p_event_date?: string
          p_is_rsvp_open?: boolean
          p_partner_one_name: string
          p_partner_two_name: string
          p_primary_locale?: string
          p_rsvp_confirmation_message?: string
          p_rsvp_deadline?: string
          p_show_guest_dietary_notes?: boolean
          p_slug?: string
          p_timezone?: string
          p_title: string
          p_venue_location?: string
          p_venue_name?: string
          p_workspace_id: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          duplicated_from_wedding_id: string | null
          event_date: string | null
          id: string
          partner_one_name: string
          partner_two_name: string
          slug: string
          status: Database["public"]["Enums"]["wedding_status"]
          title: string
          updated_at: string
          venue_location: string
          venue_name: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "weddings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: {
        Args: { p_name: string; p_slug?: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_wedding: {
        Args: {
          p_event_date?: string
          p_partner_one_name?: string
          p_partner_two_name?: string
          p_slug?: string
          p_source_wedding_id: string
          p_title: string
          p_workspace_id: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          duplicated_from_wedding_id: string | null
          event_date: string | null
          id: string
          partner_one_name: string
          partner_two_name: string
          slug: string
          status: Database["public"]["Enums"]["wedding_status"]
          title: string
          updated_at: string
          venue_location: string
          venue_name: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "weddings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      health_check: { Args: never; Returns: Json }
      list_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          email: string
          full_name: string
          joined_at: string
          member_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }[]
      }
      remove_workspace_member: {
        Args: { p_member_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      update_workspace_member_role: {
        Args: {
          p_member_user_id: string
          p_new_role: Database["public"]["Enums"]["workspace_role"]
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      wedding_access_mode: "public" | "invite_only"
      wedding_status: "draft" | "published" | "archived"
      workspace_role: "owner" | "admin" | "editor" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      wedding_access_mode: ["public", "invite_only"],
      wedding_status: ["draft", "published", "archived"],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
