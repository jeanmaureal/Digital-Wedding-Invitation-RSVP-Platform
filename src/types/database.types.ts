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
      guest_groups: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          max_attendees: number
          notes: string
          sort_order: number
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          max_attendees?: number
          notes?: string
          sort_order?: number
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          max_attendees?: number
          notes?: string
          sort_order?: number
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_groups_workspace_wedding_fkey"
            columns: ["workspace_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          dietary_notes: string
          email: string
          first_name: string
          group_id: string
          id: string
          is_child: boolean
          last_name: string
          phone: string
          side: Database["public"]["Enums"]["guest_side"]
          sort_order: number
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dietary_notes?: string
          email?: string
          first_name: string
          group_id: string
          id?: string
          is_child?: boolean
          last_name?: string
          phone?: string
          side?: Database["public"]["Enums"]["guest_side"]
          sort_order?: number
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          dietary_notes?: string
          email?: string
          first_name?: string
          group_id?: string
          id?: string
          is_child?: boolean
          last_name?: string
          phone?: string
          side?: Database["public"]["Enums"]["guest_side"]
          sort_order?: number
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_workspace_wedding_group_fkey"
            columns: ["workspace_id", "wedding_id", "group_id"]
            isOneToOne: false
            referencedRelation: "guest_groups"
            referencedColumns: ["workspace_id", "wedding_id", "id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          delivery_status: Database["public"]["Enums"]["invitation_delivery_status"]
          expires_at: string | null
          group_id: string
          id: string
          issued_by: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["invitation_delivery_status"]
          expires_at?: string | null
          group_id: string
          id?: string
          issued_by?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["invitation_delivery_status"]
          expires_at?: string | null
          group_id?: string
          id?: string
          issued_by?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_wedding_group_fkey"
            columns: ["workspace_id", "wedding_id", "group_id"]
            isOneToOne: false
            referencedRelation: "guest_groups"
            referencedColumns: ["workspace_id", "wedding_id", "id"]
          },
        ]
      }
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
      published_versions: {
        Row: {
          access_mode: Database["public"]["Enums"]["wedding_access_mode"]
          content_snapshot: Json
          id: string
          is_active: boolean
          published_at: string
          published_by: string | null
          schema_version: number
          version_number: number
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["wedding_access_mode"]
          content_snapshot: Json
          id?: string
          is_active?: boolean
          published_at?: string
          published_by?: string | null
          schema_version?: number
          version_number: number
          wedding_id: string
          workspace_id: string
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["wedding_access_mode"]
          content_snapshot?: Json
          id?: string
          is_active?: boolean
          published_at?: string
          published_by?: string | null
          schema_version?: number
          version_number?: number
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_versions_workspace_wedding_fkey"
            columns: ["workspace_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      rsvp_answers: {
        Row: {
          answer_text: string
          created_at: string
          group_id: string
          id: string
          question_id: string
          submission_id: string
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          answer_text?: string
          created_at?: string
          group_id: string
          id?: string
          question_id: string
          submission_id: string
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          group_id?: string
          id?: string
          question_id?: string
          submission_id?: string
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_answers_question_fkey"
            columns: ["workspace_id", "wedding_id", "question_id"]
            isOneToOne: false
            referencedRelation: "rsvp_questions"
            referencedColumns: ["workspace_id", "wedding_id", "id"]
          },
          {
            foreignKeyName: "rsvp_answers_submission_fkey"
            columns: ["workspace_id", "wedding_id", "group_id", "submission_id"]
            isOneToOne: false
            referencedRelation: "rsvp_submissions"
            referencedColumns: ["workspace_id", "wedding_id", "group_id", "id"]
          },
        ]
      }
      rsvp_attendees: {
        Row: {
          attendance_status: Database["public"]["Enums"]["rsvp_attendance_status"]
          created_at: string
          dietary_notes: string
          group_id: string
          guest_id: string
          id: string
          submission_id: string
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          attendance_status: Database["public"]["Enums"]["rsvp_attendance_status"]
          created_at?: string
          dietary_notes?: string
          group_id: string
          guest_id: string
          id?: string
          submission_id: string
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["rsvp_attendance_status"]
          created_at?: string
          dietary_notes?: string
          group_id?: string
          guest_id?: string
          id?: string
          submission_id?: string
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_attendees_guest_fkey"
            columns: ["workspace_id", "wedding_id", "group_id", "guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["workspace_id", "wedding_id", "group_id", "id"]
          },
          {
            foreignKeyName: "rsvp_attendees_submission_fkey"
            columns: ["workspace_id", "wedding_id", "group_id", "submission_id"]
            isOneToOne: false
            referencedRelation: "rsvp_submissions"
            referencedColumns: ["workspace_id", "wedding_id", "group_id", "id"]
          },
        ]
      }
      rsvp_questions: {
        Row: {
          created_at: string
          help_text: string
          id: string
          is_required: boolean
          label: string
          options: Json
          question_type: Database["public"]["Enums"]["rsvp_question_type"]
          sort_order: number
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          help_text?: string
          id?: string
          is_required?: boolean
          label: string
          options?: Json
          question_type?: Database["public"]["Enums"]["rsvp_question_type"]
          sort_order?: number
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          help_text?: string
          id?: string
          is_required?: boolean
          label?: string
          options?: Json
          question_type?: Database["public"]["Enums"]["rsvp_question_type"]
          sort_order?: number
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_questions_workspace_wedding_fkey"
            columns: ["workspace_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      rsvp_submissions: {
        Row: {
          additional_guests_count: number
          attending_count: number
          group_id: string
          household_note: string
          id: string
          invitation_id: string | null
          overall_status: Database["public"]["Enums"]["rsvp_attendance_status"]
          response_version: number
          submitted_at: string
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          additional_guests_count?: number
          attending_count: number
          group_id: string
          household_note?: string
          id?: string
          invitation_id?: string | null
          overall_status: Database["public"]["Enums"]["rsvp_attendance_status"]
          response_version?: number
          submitted_at?: string
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          additional_guests_count?: number
          attending_count?: number
          group_id?: string
          household_note?: string
          id?: string
          invitation_id?: string | null
          overall_status?: Database["public"]["Enums"]["rsvp_attendance_status"]
          response_version?: number
          submitted_at?: string
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_submissions_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_submissions_workspace_wedding_group_fkey"
            columns: ["workspace_id", "wedding_id", "group_id"]
            isOneToOne: false
            referencedRelation: "guest_groups"
            referencedColumns: ["workspace_id", "wedding_id", "id"]
          },
        ]
      }
      wedding_sections: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_visible: boolean
          schema_version: number
          section_type: Database["public"]["Enums"]["wedding_section_type"]
          sort_order: number
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          schema_version?: number
          section_type: Database["public"]["Enums"]["wedding_section_type"]
          sort_order: number
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          schema_version?: number
          section_type?: Database["public"]["Enums"]["wedding_section_type"]
          sort_order?: number
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_sections_workspace_wedding_fkey"
            columns: ["workspace_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
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
      wedding_themes: {
        Row: {
          created_at: string
          preset_id: Database["public"]["Enums"]["wedding_theme_preset"]
          schema_version: number
          token_overrides: Json
          updated_at: string
          wedding_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          preset_id?: Database["public"]["Enums"]["wedding_theme_preset"]
          schema_version?: number
          token_overrides?: Json
          updated_at?: string
          wedding_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          preset_id?: Database["public"]["Enums"]["wedding_theme_preset"]
          schema_version?: number
          token_overrides?: Json
          updated_at?: string
          wedding_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_themes_workspace_wedding_fkey"
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
      get_public_wedding_by_slug: { Args: { p_slug: string }; Returns: Json }
      health_check: { Args: never; Returns: Json }
      import_wedding_guests: {
        Args: {
          p_households: Json
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      issue_household_invitation: {
        Args: {
          p_expires_at?: string
          p_group_id: string
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_wedding_published_versions: {
        Args: { p_wedding_id: string; p_workspace_id: string }
        Returns: Json
      }
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
      publish_wedding: {
        Args: { p_wedding_id: string; p_workspace_id: string }
        Returns: {
          access_mode: Database["public"]["Enums"]["wedding_access_mode"]
          content_snapshot: Json
          id: string
          is_active: boolean
          published_at: string
          published_by: string | null
          schema_version: number
          version_number: number
          wedding_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "published_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_workspace_member: {
        Args: { p_member_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      reorder_wedding_sections: {
        Args: {
          p_ordered_section_ids: string[]
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: {
          content: Json
          created_at: string
          id: string
          is_visible: boolean
          schema_version: number
          section_type: Database["public"]["Enums"]["wedding_section_type"]
          sort_order: number
          updated_at: string
          wedding_id: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wedding_sections"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_invitation_by_token: { Args: { p_token: string }; Returns: Json }
      revoke_household_invitation: {
        Args: {
          p_invitation_id: string
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      rollback_wedding_published_version: {
        Args: {
          p_target_version_number: number
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: {
          access_mode: Database["public"]["Enums"]["wedding_access_mode"]
          content_snapshot: Json
          id: string
          is_active: boolean
          published_at: string
          published_by: string | null
          schema_version: number
          version_number: number
          wedding_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "published_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_household_rsvp: {
        Args: { p_payload: Json; p_token: string }
        Returns: Json
      }
      unpublish_wedding: {
        Args: { p_wedding_id: string; p_workspace_id: string }
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
      update_household_invitation: {
        Args: {
          p_delivery_status: Database["public"]["Enums"]["invitation_delivery_status"]
          p_expires_at?: string
          p_invitation_id: string
          p_wedding_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      guest_side: "partner_one" | "partner_two" | "mutual" | "other"
      invitation_delivery_status: "not_shared" | "shared"
      invitation_status: "active" | "revoked"
      rsvp_attendance_status: "attending" | "declined"
      rsvp_question_type: "short_text" | "single_select" | "boolean"
      wedding_access_mode: "public" | "invite_only"
      wedding_section_type:
        | "hero"
        | "our_story"
        | "event_schedule"
        | "venue_travel"
        | "dress_code"
        | "faq_notes"
        | "gift_registry"
        | "rsvp_banner"
      wedding_status: "draft" | "published" | "archived"
      wedding_theme_preset:
        | "editorial_ivory"
        | "garden_sage"
        | "celestial_midnight"
        | "terracotta_atelier"
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
      guest_side: ["partner_one", "partner_two", "mutual", "other"],
      invitation_delivery_status: ["not_shared", "shared"],
      invitation_status: ["active", "revoked"],
      rsvp_attendance_status: ["attending", "declined"],
      rsvp_question_type: ["short_text", "single_select", "boolean"],
      wedding_access_mode: ["public", "invite_only"],
      wedding_section_type: [
        "hero",
        "our_story",
        "event_schedule",
        "venue_travel",
        "dress_code",
        "faq_notes",
        "gift_registry",
        "rsvp_banner",
      ],
      wedding_status: ["draft", "published", "archived"],
      wedding_theme_preset: [
        "editorial_ivory",
        "garden_sage",
        "celestial_midnight",
        "terracotta_atelier",
      ],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
