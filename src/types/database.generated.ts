export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      attendance_identity_links: {
        Row: {
          id: number;
          linked_at: string;
          linked_by: string;
          neon_user_id: number;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          id?: never;
          linked_at?: string;
          linked_by: string;
          neon_user_id: number;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          id?: never;
          linked_at?: string;
          linked_by?: string;
          neon_user_id?: number;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_identity_links_linked_by_member_fk";
            columns: ["organization_id", "linked_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "attendance_identity_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_identity_links_profile_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: true;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_profile_id: string | null;
          after_state: Json | null;
          before_state: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          location_id: string | null;
          organization_id: string;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_profile_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          location_id?: string | null;
          organization_id: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_profile_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          location_id?: string | null;
          organization_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_member_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_rules: {
        Row: {
          available_from: string;
          available_until: string;
          created_at: string;
          day_of_week: number;
          effective_from: string;
          effective_until: string | null;
          id: number;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          available_from: string;
          available_until: string;
          created_at?: string;
          day_of_week: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: never;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          available_from?: string;
          available_until?: string;
          created_at?: string;
          day_of_week?: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: never;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "availability_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_rules_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_recipe_categories: {
        Row: {
          created_at: string;
          created_by: string;
          display_order: number;
          id: string;
          is_active: boolean;
          is_fallback: boolean;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          is_fallback?: boolean;
          name: string;
          organization_id: string;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          is_fallback?: boolean;
          name?: string;
          organization_id?: string;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_categories_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "bar_recipe_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipe_categories_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      bar_recipe_garnishes: {
        Row: {
          id: string;
          name: string;
          notes: string | null;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          notes?: string | null;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          sort_order?: number;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_garnishes_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_ingredients: {
        Row: {
          amount: string | null;
          id: string;
          ingredient_name: string;
          organization_id: string;
          preparation: string | null;
          sort_order: number;
          unit: string | null;
          variant_id: string;
        };
        Insert: {
          amount?: string | null;
          id?: string;
          ingredient_name: string;
          organization_id: string;
          preparation?: string | null;
          sort_order: number;
          unit?: string | null;
          variant_id: string;
        };
        Update: {
          amount?: string | null;
          id?: string;
          ingredient_name?: string;
          organization_id?: string;
          preparation?: string | null;
          sort_order?: number;
          unit?: string | null;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_ingredients_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_steps: {
        Row: {
          id: string;
          instruction: string;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Insert: {
          id?: string;
          instruction: string;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Update: {
          id?: string;
          instruction?: string;
          organization_id?: string;
          sort_order?: number;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_steps_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_variants: {
        Row: {
          batch_notes: string | null;
          created_at: string;
          glass: string | null;
          glass_notes: string | null;
          id: string;
          method: string | null;
          organization_id: string;
          presentation_notes: string | null;
          recipe_id: string;
          rim_notes: string | null;
          rim_type: string | null;
          tips: string | null;
          updated_at: string;
          variant: string;
        };
        Insert: {
          batch_notes?: string | null;
          created_at?: string;
          glass?: string | null;
          glass_notes?: string | null;
          id?: string;
          method?: string | null;
          organization_id: string;
          presentation_notes?: string | null;
          recipe_id: string;
          rim_notes?: string | null;
          rim_type?: string | null;
          tips?: string | null;
          updated_at?: string;
          variant: string;
        };
        Update: {
          batch_notes?: string | null;
          created_at?: string;
          glass?: string | null;
          glass_notes?: string | null;
          id?: string;
          method?: string | null;
          organization_id?: string;
          presentation_notes?: string | null;
          recipe_id?: string;
          rim_notes?: string | null;
          rim_type?: string | null;
          tips?: string | null;
          updated_at?: string;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_variants_recipe_fk";
            columns: ["recipe_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipes: {
        Row: {
          alternate_name: string | null;
          archived_at: string | null;
          archived_by: string | null;
          base_spirit: string | null;
          category_id: string;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          image_path: string | null;
          image_thumb_path: string | null;
          is_active: boolean;
          is_alcoholic: boolean;
          is_menu_item: boolean;
          is_popular: boolean;
          name: string;
          organization_id: string;
          recipe_number: number;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          alternate_name?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_spirit?: string | null;
          category_id: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          image_thumb_path?: string | null;
          is_active?: boolean;
          is_alcoholic?: boolean;
          is_menu_item?: boolean;
          is_popular?: boolean;
          name: string;
          organization_id: string;
          recipe_number: number;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          alternate_name?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_spirit?: string | null;
          category_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          image_thumb_path?: string | null;
          is_active?: boolean;
          is_alcoholic?: boolean;
          is_menu_item?: boolean;
          is_popular?: boolean;
          name?: string;
          organization_id?: string;
          recipe_number?: number;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipes_archiver_fk";
            columns: ["organization_id", "archived_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "bar_recipes_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bar_recipes_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "bar_recipes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      board_events: {
        Row: {
          actor_profile_id: string;
          created_at: string;
          event_type: Database["public"]["Enums"]["board_event_type"];
          id: number;
          inverse_payload: Json;
          organization_id: string;
          payload: Json;
          service_session_id: number;
          undone_at: string | null;
        };
        Insert: {
          actor_profile_id: string;
          created_at?: string;
          event_type: Database["public"]["Enums"]["board_event_type"];
          id?: never;
          inverse_payload?: Json;
          organization_id: string;
          payload?: Json;
          service_session_id: number;
          undone_at?: string | null;
        };
        Update: {
          actor_profile_id?: string;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["board_event_type"];
          id?: never;
          inverse_payload?: Json;
          organization_id?: string;
          payload?: Json;
          service_session_id?: number;
          undone_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "board_events_organization_id_actor_profile_id_fkey";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "board_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "board_events_service_session_id_organization_id_fkey";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      checklist_instances: {
        Row: {
          generated_at: string;
          generated_by: string | null;
          id: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          service_date: string;
          template_id: string;
        };
        Insert: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          service_date: string;
          template_id: string;
        };
        Update: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["checklist_kind"];
          location_id?: string;
          name?: string;
          organization_id?: string;
          service_date?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_instances_generator_fk";
            columns: ["organization_id", "generated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "checklist_instances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_instances_template_fk";
            columns: ["template_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
        ];
      };
      checklist_template_item_assignees: {
        Row: {
          item_id: string;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          item_id: string;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          item_id?: string;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_template_item_assignees_item_fk";
            columns: ["item_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_template_items";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "checklist_template_item_assignees_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      checklist_template_items: {
        Row: {
          active: boolean;
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          category: string;
          created_at: string;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          id: string;
          instructions: string | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          sort_order: number;
          template_id: string;
          title: string;
        };
        Insert: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          id?: string;
          instructions?: string | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          sort_order?: number;
          template_id: string;
          title: string;
        };
        Update: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          id?: string;
          instructions?: string | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          sort_order?: number;
          template_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "checklist_template_items_template_fk";
            columns: ["template_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      checklist_templates: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          days_of_week: number[];
          id: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          days_of_week?: number[];
          id?: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          days_of_week?: number[];
          id?: string;
          kind?: Database["public"]["Enums"]["checklist_kind"];
          location_id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_templates_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "checklist_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "checklist_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      dining_areas: {
        Row: {
          area_order: number;
          created_at: string;
          id: number;
          location_id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          area_order?: number;
          created_at?: string;
          id?: never;
          location_id: string;
          name: string;
          organization_id: string;
        };
        Update: {
          area_order?: number;
          created_at?: string;
          id?: never;
          location_id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_areas_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_areas_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      dining_tables: {
        Row: {
          active: boolean;
          combinable_group: string | null;
          created_at: string;
          dining_area_id: number;
          id: number;
          label: string;
          location_id: string;
          organization_id: string;
          position_x: number | null;
          position_y: number | null;
          seat_count: number;
          sequence: number;
        };
        Insert: {
          active?: boolean;
          combinable_group?: string | null;
          created_at?: string;
          dining_area_id: number;
          id?: never;
          label: string;
          location_id: string;
          organization_id: string;
          position_x?: number | null;
          position_y?: number | null;
          seat_count: number;
          sequence?: number;
        };
        Update: {
          active?: boolean;
          combinable_group?: string | null;
          created_at?: string;
          dining_area_id?: number;
          id?: never;
          label?: string;
          location_id?: string;
          organization_id?: string;
          position_x?: number | null;
          position_y?: number | null;
          seat_count?: number;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dining_tables_area_tenant_fk";
            columns: ["dining_area_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_areas";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_tables_dining_area_id_fkey";
            columns: ["dining_area_id"];
            isOneToOne: false;
            referencedRelation: "dining_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_tables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_templates: {
        Row: {
          assignments: Json;
          created_at: string;
          id: number;
          location_id: string;
          meal_period: string;
          name: string;
          organization_id: string;
          server_count: number;
        };
        Insert: {
          assignments?: Json;
          created_at?: string;
          id?: never;
          location_id: string;
          meal_period: string;
          name: string;
          organization_id: string;
          server_count: number;
        };
        Update: {
          assignments?: Json;
          created_at?: string;
          id?: never;
          location_id?: string;
          meal_period?: string;
          name?: string;
          organization_id?: string;
          server_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "floor_templates_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "floor_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_adjustments: {
        Row: {
          actor_profile_id: string;
          created_at: string;
          cutoff_at_time: number | null;
          delta_backup: number | null;
          delta_on_hand: number | null;
          delta_total: number | null;
          id: number;
          import_batch_id: string | null;
          location_id: string;
          new_backup: number;
          new_on_hand: number;
          note: string | null;
          organization_id: string;
          prev_backup: number;
          prev_on_hand: number;
          product_id: string;
          reason: string;
          source: string;
          status_after: string;
          stock_version_after: number;
        };
        Insert: {
          actor_profile_id: string;
          created_at?: string;
          cutoff_at_time?: number | null;
          delta_backup?: number | null;
          delta_on_hand?: number | null;
          delta_total?: number | null;
          id?: never;
          import_batch_id?: string | null;
          location_id: string;
          new_backup: number;
          new_on_hand: number;
          note?: string | null;
          organization_id: string;
          prev_backup: number;
          prev_on_hand: number;
          product_id: string;
          reason: string;
          source: string;
          status_after: string;
          stock_version_after: number;
        };
        Update: {
          actor_profile_id?: string;
          created_at?: string;
          cutoff_at_time?: number | null;
          delta_backup?: number | null;
          delta_on_hand?: number | null;
          delta_total?: number | null;
          id?: never;
          import_batch_id?: string | null;
          location_id?: string;
          new_backup?: number;
          new_on_hand?: number;
          note?: string | null;
          organization_id?: string;
          prev_backup?: number;
          prev_on_hand?: number;
          product_id?: string;
          reason?: string;
          source?: string;
          status_after?: string;
          stock_version_after?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_actor_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_adjustments_import_batch_fk";
            columns: ["import_batch_id"];
            isOneToOne: false;
            referencedRelation: "inventory_import_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_adjustments_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_categories: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          organization_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          organization_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          organization_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_categories_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_categories_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      inventory_change_log: {
        Row: {
          action: string;
          actor_profile_id: string;
          created_at: string;
          diff: Json;
          entity_id: string | null;
          entity_type: string;
          id: number;
          location_id: string | null;
          organization_id: string;
        };
        Insert: {
          action: string;
          actor_profile_id: string;
          created_at?: string;
          diff?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          location_id?: string | null;
          organization_id: string;
        };
        Update: {
          action?: string;
          actor_profile_id?: string;
          created_at?: string;
          diff?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          location_id?: string | null;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_change_log_actor_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_change_log_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_change_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_import_batches: {
        Row: {
          actor_profile_id: string;
          categories_created: number;
          committed_at: string | null;
          created_at: string;
          created_count: number;
          error_count: number;
          filename: string;
          format: string;
          id: string;
          location_id: string;
          organization_id: string;
          reason: string;
          request_id: string;
          result: Json | null;
          rows_in_file: number;
          sheet: string | null;
          skipped_count: number;
          staged_plan: Json;
          status: string;
          subcategories_created: number;
          updated_count: number;
          vendors_created: number;
        };
        Insert: {
          actor_profile_id: string;
          categories_created?: number;
          committed_at?: string | null;
          created_at?: string;
          created_count?: number;
          error_count?: number;
          filename: string;
          format: string;
          id?: string;
          location_id: string;
          organization_id: string;
          reason: string;
          request_id: string;
          result?: Json | null;
          rows_in_file?: number;
          sheet?: string | null;
          skipped_count?: number;
          staged_plan: Json;
          status?: string;
          subcategories_created?: number;
          updated_count?: number;
          vendors_created?: number;
        };
        Update: {
          actor_profile_id?: string;
          categories_created?: number;
          committed_at?: string | null;
          created_at?: string;
          created_count?: number;
          error_count?: number;
          filename?: string;
          format?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          reason?: string;
          request_id?: string;
          result?: Json | null;
          rows_in_file?: number;
          sheet?: string | null;
          skipped_count?: number;
          staged_plan?: Json;
          status?: string;
          subcategories_created?: number;
          updated_count?: number;
          vendors_created?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_import_batches_actor_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_import_batches_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_import_batches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_order_draft_items: {
        Row: {
          created_at: string;
          draft_id: string;
          id: string;
          included: boolean;
          item_note: string | null;
          location_id: string;
          order_qty: number | null;
          organization_id: string;
          par_at_snapshot: number | null;
          product_id: string;
          product_name: string;
          size: string | null;
          sku: string | null;
          status_at_snapshot: string;
          suggested_qty: number | null;
          total_at_snapshot: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          draft_id: string;
          id?: string;
          included?: boolean;
          item_note?: string | null;
          location_id: string;
          order_qty?: number | null;
          organization_id: string;
          par_at_snapshot?: number | null;
          product_id: string;
          product_name: string;
          size?: string | null;
          sku?: string | null;
          status_at_snapshot: string;
          suggested_qty?: number | null;
          total_at_snapshot: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          draft_id?: string;
          id?: string;
          included?: boolean;
          item_note?: string | null;
          location_id?: string;
          order_qty?: number | null;
          organization_id?: string;
          par_at_snapshot?: number | null;
          product_id?: string;
          product_name?: string;
          size?: string | null;
          sku?: string | null;
          status_at_snapshot?: string;
          suggested_qty?: number | null;
          total_at_snapshot?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_order_draft_items_draft_fk";
            columns: ["draft_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "inventory_order_drafts";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "inventory_order_draft_items_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_order_drafts: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          location_id: string;
          organization_id: string;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          updated_at: string;
          updated_by: string;
          vendor_id: string;
          vendor_name: string;
          vendor_note: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          location_id: string;
          organization_id: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          updated_at?: string;
          updated_by: string;
          vendor_id: string;
          vendor_name: string;
          vendor_note?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string;
          vendor_id?: string;
          vendor_name?: string;
          vendor_note?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_order_drafts_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_sender_fk";
            columns: ["organization_id", "sent_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_vendor_fk";
            columns: ["vendor_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_vendors";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_products: {
        Row: {
          active: boolean;
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          notes: string | null;
          organization_id: string;
          size: string | null;
          size_key: string;
          sku: string | null;
          sku_key: string | null;
          subcategory_id: string | null;
          unit_key: string;
          unit_label: string | null;
          unit_type: string;
          updated_at: string;
          updated_by: string | null;
          vendor_id: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          notes?: string | null;
          organization_id: string;
          size?: string | null;
          size_key?: string;
          sku?: string | null;
          sku_key?: string | null;
          subcategory_id?: string | null;
          unit_key?: string;
          unit_label?: string | null;
          unit_type: string;
          updated_at?: string;
          updated_by?: string | null;
          vendor_id: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          notes?: string | null;
          organization_id?: string;
          size?: string | null;
          size_key?: string;
          sku?: string | null;
          sku_key?: string | null;
          subcategory_id?: string | null;
          unit_key?: string;
          unit_label?: string | null;
          unit_type?: string;
          updated_at?: string;
          updated_by?: string | null;
          vendor_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_products_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_products_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_products_subcategory_fk";
            columns: ["subcategory_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "inventory_subcategories";
            referencedColumns: ["id", "category_id"];
          },
          {
            foreignKeyName: "inventory_products_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_products_vendor_fk";
            columns: ["vendor_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_vendors";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_stock: {
        Row: {
          backup: number;
          created_at: string;
          cutoff: number | null;
          last_adjusted_at: string | null;
          location_id: string;
          on_hand: number;
          organization_id: string;
          par: number | null;
          product_id: string;
          total: number | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
          warning: number | null;
        };
        Insert: {
          backup?: number;
          created_at?: string;
          cutoff?: number | null;
          last_adjusted_at?: string | null;
          location_id: string;
          on_hand?: number;
          organization_id: string;
          par?: number | null;
          product_id: string;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          warning?: number | null;
        };
        Update: {
          backup?: number;
          created_at?: string;
          cutoff?: number | null;
          last_adjusted_at?: string | null;
          location_id?: string;
          on_hand?: number;
          organization_id?: string;
          par?: number | null;
          product_id?: string;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          warning?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_stock_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      inventory_subcategories: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_subcategories_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_subcategories_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_subcategories_org_fk";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_subcategories_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      inventory_vendors: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          is_system: boolean;
          name: string;
          name_key: string;
          notes: string | null;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          id?: string;
          is_system?: boolean;
          name: string;
          name_key?: string;
          notes?: string | null;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
          name_key?: string;
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_vendors_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "inventory_vendors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_vendors_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      locations: {
        Row: {
          active: boolean;
          address: Json;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name: string;
          opening_local?: string;
          organization_id: string;
          time_zone?: string;
        };
        Update: {
          active?: boolean;
          address?: Json;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name?: string;
          opening_local?: string;
          organization_id?: string;
          time_zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          roles?: Database["public"]["Enums"]["app_role"][];
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      operating_hours: {
        Row: {
          closed: boolean;
          closing_local: string | null;
          created_at: string;
          day_of_week: number;
          id: number;
          location_id: string;
          opening_local: string | null;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          closed?: boolean;
          closing_local?: string | null;
          created_at?: string;
          day_of_week: number;
          id?: never;
          location_id: string;
          opening_local?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          closed?: boolean;
          closing_local?: string | null;
          created_at?: string;
          day_of_week?: number;
          id?: never;
          location_id?: string;
          opening_local?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operating_hours_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "operating_hours_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      passcode_credentials: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          locator: string;
          organization_id: string;
          profile_id: string;
          synthetic_email: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          locator: string;
          organization_id: string;
          profile_id: string;
          synthetic_email: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          locator?: string;
          organization_id?: string;
          profile_id?: string;
          synthetic_email?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passcode_credentials_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: true;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      passcode_lockout_resets: {
        Row: {
          cleared_at: string;
          cleared_by: string;
          id: number;
          organization_id: string;
          reason: string;
        };
        Insert: {
          cleared_at?: string;
          cleared_by: string;
          id?: never;
          organization_id: string;
          reason: string;
        };
        Update: {
          cleared_at?: string;
          cleared_by?: string;
          id?: never;
          organization_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_lockout_resets_organization_id_cleared_by_fkey";
            columns: ["organization_id", "cleared_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "passcode_lockout_resets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      passcode_login_attempts: {
        Row: {
          attempted_at: string;
          fingerprint: string;
          id: number;
          organization_id: string;
          succeeded: boolean;
        };
        Insert: {
          attempted_at?: string;
          fingerprint: string;
          id?: never;
          organization_id: string;
          succeeded?: boolean;
        };
        Update: {
          attempted_at?: string;
          fingerprint?: string;
          id?: never;
          organization_id?: string;
          succeeded?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_login_attempts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_adjustments: {
        Row: {
          created_at: string;
          created_by: string;
          delta_cents: number;
          id: number;
          organization_id: string;
          payroll_period_id: number;
          reason: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          delta_cents: number;
          id?: never;
          organization_id: string;
          payroll_period_id: number;
          reason: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          delta_cents?: number;
          id?: never;
          organization_id?: string;
          payroll_period_id?: number;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_organization_id_created_by_fkey";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_adjustments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_adjustments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_payments: {
        Row: {
          amount_cents: number;
          comment: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string;
          id: number;
          organization_id: string;
          payment_date: string;
          payroll_period_id: number;
          reverses_payment_id: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          comment?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by: string;
          id?: never;
          organization_id: string;
          payment_date: string;
          payroll_period_id: number;
          reverses_payment_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          comment?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: never;
          organization_id?: string;
          payment_date?: string;
          payroll_period_id?: number;
          reverses_payment_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_payments_organization_id_confirmed_by_fkey";
            columns: ["organization_id", "confirmed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_payments_organization_id_created_by_fkey";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_payments_organization_id_reverses_payment_id_fkey";
            columns: ["organization_id", "reverses_payment_id"];
            isOneToOne: false;
            referencedRelation: "payroll_payments";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "payroll_payments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_periods: {
        Row: {
          generated_at: string;
          generated_by: string;
          gross_cents: number;
          hours_snapshot: number;
          id: number;
          locked_at: string | null;
          locked_by: string | null;
          neon_user_id: number;
          organization_id: string;
          period_month: string;
          rate_cents_snapshot: number;
          regenerated_at: string | null;
          regenerated_by: string | null;
          status: string;
        };
        Insert: {
          generated_at?: string;
          generated_by: string;
          gross_cents: number;
          hours_snapshot: number;
          id?: never;
          locked_at?: string | null;
          locked_by?: string | null;
          neon_user_id: number;
          organization_id: string;
          period_month: string;
          rate_cents_snapshot: number;
          regenerated_at?: string | null;
          regenerated_by?: string | null;
          status?: string;
        };
        Update: {
          generated_at?: string;
          generated_by?: string;
          gross_cents?: number;
          hours_snapshot?: number;
          id?: never;
          locked_at?: string | null;
          locked_by?: string | null;
          neon_user_id?: number;
          organization_id?: string;
          period_month?: string;
          rate_cents_snapshot?: number;
          regenerated_at?: string | null;
          regenerated_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_organization_id_generated_by_fkey";
            columns: ["organization_id", "generated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_periods_organization_id_locked_by_fkey";
            columns: ["organization_id", "locked_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_periods_organization_id_regenerated_by_fkey";
            columns: ["organization_id", "regenerated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      payroll_rates: {
        Row: {
          id: number;
          neon_user_id: number;
          organization_id: string;
          rate_cents: number;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: never;
          neon_user_id: number;
          organization_id: string;
          rate_cents: number;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          id?: never;
          neon_user_id?: number;
          organization_id?: string;
          rate_cents?: number;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_rates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_rates_organization_id_updated_by_fkey";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      payroll_settings: {
        Row: {
          default_rate_cents: number;
          organization_id: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          default_rate_cents: number;
          organization_id: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          default_rate_cents?: number;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_settings_organization_id_updated_by_fkey";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          contact: string | null;
          created_at: string;
          display_name: string;
          id: number;
          organization_id: string;
          profile_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          self_served: boolean;
          status: Database["public"]["Enums"]["access_request_status"];
        };
        Insert: {
          contact?: string | null;
          created_at?: string;
          display_name: string;
          id?: never;
          organization_id: string;
          profile_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          self_served?: boolean;
          status?: Database["public"]["Enums"]["access_request_status"];
        };
        Update: {
          contact?: string | null;
          created_at?: string;
          display_name?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          self_served?: boolean;
          status?: Database["public"]["Enums"]["access_request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "access_requests_organization_id_reviewed_by_fkey";
            columns: ["organization_id", "reviewed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "registrations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rotation_members: {
        Row: {
          active_table_count: number;
          cover_count: number;
          id: number;
          last_seated_at: string | null;
          max_concurrent_tables: number | null;
          organization_id: string;
          party_count: number;
          position: number;
          server_profile_id: string;
          service_session_id: number;
          status: Database["public"]["Enums"]["rotation_status"];
          updated_at: string;
        };
        Insert: {
          active_table_count?: number;
          cover_count?: number;
          id?: never;
          last_seated_at?: string | null;
          max_concurrent_tables?: number | null;
          organization_id: string;
          party_count?: number;
          position: number;
          server_profile_id: string;
          service_session_id: number;
          status?: Database["public"]["Enums"]["rotation_status"];
          updated_at?: string;
        };
        Update: {
          active_table_count?: number;
          cover_count?: number;
          id?: never;
          last_seated_at?: string | null;
          max_concurrent_tables?: number | null;
          organization_id?: string;
          party_count?: number;
          position?: number;
          server_profile_id?: string;
          service_session_id?: number;
          status?: Database["public"]["Enums"]["rotation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rotation_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_server_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "rotation_members_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      rotation_rounds: {
        Row: {
          created_at: string;
          id: number;
          organization_id: string;
          sequence: number;
          service_session_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          organization_id: string;
          sequence: number;
          service_session_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          organization_id?: string;
          sequence?: number;
          service_session_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rotation_rounds_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_rounds_service_session_id_organization_id_fkey";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      schedule_periods: {
        Row: {
          created_at: string;
          ends_on: string;
          id: number;
          location_id: string;
          organization_id: string;
          published_at: string | null;
          published_by: string | null;
          published_version: number;
          starts_on: string;
          status: Database["public"]["Enums"]["schedule_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: never;
          location_id: string;
          organization_id: string;
          published_at?: string | null;
          published_by?: string | null;
          published_version?: number;
          starts_on: string;
          status?: Database["public"]["Enums"]["schedule_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: never;
          location_id?: string;
          organization_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          published_version?: number;
          starts_on?: string;
          status?: Database["public"]["Enums"]["schedule_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_periods_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_periods_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "schedule_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_periods_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_publisher_member_fk";
            columns: ["organization_id", "published_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      seating_tables: {
        Row: {
          dining_table_id: number;
          organization_id: string;
          released_at: string | null;
          seating_id: number;
        };
        Insert: {
          dining_table_id: number;
          organization_id: string;
          released_at?: string | null;
          seating_id: number;
        };
        Update: {
          dining_table_id?: number;
          organization_id?: string;
          released_at?: string | null;
          seating_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "seating_tables_dining_table_id_fkey";
            columns: ["dining_table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_seating_id_fkey";
            columns: ["seating_id"];
            isOneToOne: false;
            referencedRelation: "seatings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_seating_tenant_fk";
            columns: ["seating_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "seatings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "seating_tables_table_tenant_fk";
            columns: ["dining_table_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      seatings: {
        Row: {
          closed_at: string | null;
          created_at: string;
          decided_by: string;
          id: number;
          idempotency_key: string;
          location_id: string;
          notes: string | null;
          organization_id: string;
          override_reason: string | null;
          party_size: number;
          seated_at: string;
          server_profile_id: string;
          service_session_id: number;
          status: Database["public"]["Enums"]["seating_status"];
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          decided_by: string;
          id?: never;
          idempotency_key: string;
          location_id: string;
          notes?: string | null;
          organization_id: string;
          override_reason?: string | null;
          party_size: number;
          seated_at?: string;
          server_profile_id: string;
          service_session_id: number;
          status?: Database["public"]["Enums"]["seating_status"];
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          decided_by?: string;
          id?: never;
          idempotency_key?: string;
          location_id?: string;
          notes?: string | null;
          organization_id?: string;
          override_reason?: string | null;
          party_size?: number;
          seated_at?: string;
          server_profile_id?: string;
          service_session_id?: number;
          status?: Database["public"]["Enums"]["seating_status"];
        };
        Relationships: [
          {
            foreignKeyName: "seatings_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_decider_member_fk";
            columns: ["organization_id", "decided_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "seatings_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "seatings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_server_member_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "seatings_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      section_assignments: {
        Row: {
          created_at: string;
          dining_table_id: number;
          id: number;
          location_id: string;
          locked: boolean;
          organization_id: string;
          released_at: string | null;
          rotation_member_id: number | null;
          server_profile_id: string | null;
          service_session_id: number;
          table_rotation_entry_id: number | null;
        };
        Insert: {
          created_at?: string;
          dining_table_id: number;
          id?: never;
          location_id: string;
          locked?: boolean;
          organization_id: string;
          released_at?: string | null;
          rotation_member_id?: number | null;
          server_profile_id?: string | null;
          service_session_id: number;
          table_rotation_entry_id?: number | null;
        };
        Update: {
          created_at?: string;
          dining_table_id?: number;
          id?: never;
          location_id?: string;
          locked?: boolean;
          organization_id?: string;
          released_at?: string | null;
          rotation_member_id?: number | null;
          server_profile_id?: string | null;
          service_session_id?: number;
          table_rotation_entry_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "section_assignments_dining_table_id_fkey";
            columns: ["dining_table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_entry_fk";
            columns: ["table_rotation_entry_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "table_rotation_entries";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_entry_session_fk";
            columns: ["table_rotation_entry_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "table_rotation_entries";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "section_assignments_member_session_fk";
            columns: ["rotation_member_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "section_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_rotation_member_fk";
            columns: ["rotation_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_server_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "section_assignments_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_session_location_fk";
            columns: ["service_session_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "location_id"];
          },
          {
            foreignKeyName: "section_assignments_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_table_location_fk";
            columns: ["dining_table_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "location_id"];
          },
          {
            foreignKeyName: "section_assignments_table_tenant_fk";
            columns: ["dining_table_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      service_sessions: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          id: number;
          location_id: string;
          meal_period: string;
          organization_id: string;
          service_date: string;
          started_at: string | null;
          started_by: string | null;
          status: Database["public"]["Enums"]["service_status"];
        };
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: never;
          location_id: string;
          meal_period: string;
          organization_id: string;
          service_date: string;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["service_status"];
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: never;
          location_id?: string;
          meal_period?: string;
          organization_id?: string;
          service_date?: string;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["service_status"];
        };
        Relationships: [
          {
            foreignKeyName: "service_closed_by_member_fk";
            columns: ["organization_id", "closed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "service_sessions_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "service_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_started_by_member_fk";
            columns: ["organization_id", "started_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      shift_assignments: {
        Row: {
          created_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          shift_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          shift_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          shift_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shift_assignments_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "shift_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_tenant_fk";
            columns: ["shift_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      shift_kind_defaults: {
        Row: {
          end_local: string;
          id: number;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          organization_id: string;
          start_local: string;
          updated_at: string;
        };
        Insert: {
          end_local: string;
          id?: never;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          organization_id: string;
          start_local: string;
          updated_at?: string;
        };
        Update: {
          end_local?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id?: string;
          organization_id?: string;
          start_local?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_kind_defaults_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shift_kind_defaults_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_templates: {
        Row: {
          created_at: string;
          end_local: string;
          id: number;
          kind: Database["public"]["Enums"]["shift_kind"] | null;
          location_id: string;
          name: string;
          organization_id: string;
          role_label: string;
          start_local: string;
          station: string | null;
        };
        Insert: {
          created_at?: string;
          end_local: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"] | null;
          location_id: string;
          name: string;
          organization_id: string;
          role_label: string;
          start_local: string;
          station?: string | null;
        };
        Update: {
          created_at?: string;
          end_local?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"] | null;
          location_id?: string;
          name?: string;
          organization_id?: string;
          role_label?: string;
          start_local?: string;
          station?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shift_templates_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shift_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shifts: {
        Row: {
          created_at: string;
          end_date: string;
          ends_at: string;
          id: number;
          is_recurring: boolean;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          notes: string | null;
          organization_id: string;
          role_label: string;
          schedule_period_id: number;
          series_id: string | null;
          service_date: string;
          starts_at: string;
          station: string | null;
          template_id: number | null;
          uses_default_time: boolean;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          ends_at: string;
          id?: never;
          is_recurring?: boolean;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          notes?: string | null;
          organization_id: string;
          role_label: string;
          schedule_period_id: number;
          series_id?: string | null;
          service_date: string;
          starts_at: string;
          station?: string | null;
          template_id?: number | null;
          uses_default_time?: boolean;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          ends_at?: string;
          id?: never;
          is_recurring?: boolean;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id?: string;
          notes?: string | null;
          organization_id?: string;
          role_label?: string;
          schedule_period_id?: number;
          series_id?: string | null;
          service_date?: string;
          starts_at?: string;
          station?: string | null;
          template_id?: number | null;
          uses_default_time?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shifts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_period_tenant_fk";
            columns: ["schedule_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schedule_periods";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shifts_schedule_period_id_fkey";
            columns: ["schedule_period_id"];
            isOneToOne: false;
            referencedRelation: "schedule_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_template_tenant_fk";
            columns: ["template_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      table_rotation_entries: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          ended_at: string | null;
          ended_by: string | null;
          id: number;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          service_session_id: number;
          status: string;
          table_label: string | null;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: never;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          service_session_id: number;
          status?: string;
          table_label?: string | null;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: never;
          organization_id?: string;
          rotation_member_id?: number;
          rotation_round_id?: number;
          service_session_id?: number;
          status?: string;
          table_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "table_rotation_entries_ended_by_fk";
            columns: ["organization_id", "ended_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_member_session_fk";
            columns: ["rotation_member_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_organization_id_assigned_by_fkey";
            columns: ["organization_id", "assigned_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_rotation_entries_rotation_member_id_organization_id_fkey";
            columns: ["rotation_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_rotation_round_id_organization_id_fkey";
            columns: ["rotation_round_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_rounds";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_round_session_fk";
            columns: ["rotation_round_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_rounds";
            referencedColumns: ["id", "service_session_id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          organization_id: string;
          profile_id: string;
          task_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          organization_id: string;
          profile_id: string;
          task_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          organization_id?: string;
          profile_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_assigner_fk";
            columns: ["organization_id", "assigned_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_assignments_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_assignments_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_categories: {
        Row: {
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      task_events: {
        Row: {
          actor_profile_id: string | null;
          checklist_instance_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          id: number;
          organization_id: string;
          payload: Json;
          task_id: string | null;
        };
        Insert: {
          actor_profile_id?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          id?: never;
          organization_id: string;
          payload?: Json;
          task_id?: string | null;
        };
        Update: {
          actor_profile_id?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["task_event_type"];
          id?: never;
          organization_id?: string;
          payload?: Json;
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_events_actor_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_events_instance_fk";
            columns: ["checklist_instance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_events_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_notifications: {
        Row: {
          body: string | null;
          checklist_instance_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          id: number;
          organization_id: string;
          payload: Json | null;
          read_at: string | null;
          recipient_profile_id: string;
          task_id: string | null;
          title: string;
          type: Database["public"]["Enums"]["task_notification_type"];
        };
        Insert: {
          body?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: never;
          organization_id: string;
          payload?: Json | null;
          read_at?: string | null;
          recipient_profile_id: string;
          task_id?: string | null;
          title: string;
          type: Database["public"]["Enums"]["task_notification_type"];
        };
        Update: {
          body?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: never;
          organization_id?: string;
          payload?: Json | null;
          read_at?: string | null;
          recipient_profile_id?: string;
          task_id?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["task_notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "task_notifications_instance_fk";
            columns: ["checklist_instance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_notifications_recipient_fk";
            columns: ["organization_id", "recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_notifications_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_recurrence_assignees: {
        Row: {
          organization_id: string;
          profile_id: string;
          rule_id: string;
        };
        Insert: {
          organization_id: string;
          profile_id: string;
          rule_id: string;
        };
        Update: {
          organization_id?: string;
          profile_id?: string;
          rule_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_recurrence_assignees_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_recurrence_assignees_rule_fk";
            columns: ["rule_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "task_recurrence_rules";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_recurrence_rules: {
        Row: {
          active: boolean;
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          category: string;
          created_at: string;
          created_by: string;
          day_of_month: number | null;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          end_type: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id: string;
          instructions: string | null;
          location_id: string;
          max_occurrences: number | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          starts_on: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
          weekdays: number[] | null;
        };
        Insert: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          created_by: string;
          day_of_month?: number | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          end_type?: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on?: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          instructions?: string | null;
          location_id: string;
          max_occurrences?: number | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          starts_on: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          weekdays?: number[] | null;
        };
        Update: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          created_by?: string;
          day_of_month?: number | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          end_type?: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          instructions?: string | null;
          location_id?: string;
          max_occurrences?: number | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          starts_on?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_recurrence_rules_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "task_recurrence_rules_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_recurrence_rules_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_recurrence_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          category: string;
          checklist_instance_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          completion_note: string | null;
          created_at: string;
          created_by: string;
          due_at: string | null;
          due_date: string | null;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          group_id: string | null;
          id: string;
          instructions: string | null;
          kind: Database["public"]["Enums"]["task_kind"];
          location_id: string;
          occurrence_date: string | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id: string | null;
          sort_order: number;
          start_date: string | null;
          started_at: string | null;
          started_by: string | null;
          status: Database["public"]["Enums"]["task_status"];
          template_item_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category?: string;
          checklist_instance_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by: string;
          due_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          group_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["task_kind"];
          location_id: string;
          occurrence_date?: string | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id?: string | null;
          sort_order?: number;
          start_date?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          template_item_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category?: string;
          checklist_instance_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string;
          due_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          group_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["task_kind"];
          location_id?: string;
          occurrence_date?: string | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id?: string | null;
          sort_order?: number;
          start_date?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          template_item_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_canceller_fk";
            columns: ["organization_id", "cancelled_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tasks_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "tasks_completer_fk";
            columns: ["organization_id", "completed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tasks_creator_fk";
            columns: ["organization_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tasks_instance_fk";
            columns: [
              "checklist_instance_id",
              "organization_id",
              "location_id",
            ];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "tasks_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_recurrence_fk";
            columns: ["recurrence_rule_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "task_recurrence_rules";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "tasks_starter_fk";
            columns: ["organization_id", "started_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tasks_template_item_id_fkey";
            columns: ["template_item_id"];
            isOneToOne: false;
            referencedRelation: "checklist_template_items";
            referencedColumns: ["id"];
          },
        ];
      };
      time_off_requests: {
        Row: {
          created_at: string;
          ends_at: string;
          id: number;
          note: string | null;
          organization_id: string;
          profile_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["request_status"];
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: never;
          note?: string | null;
          organization_id: string;
          profile_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: never;
          note?: string | null;
          organization_id?: string;
          profile_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "time_off_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "time_off_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_requests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_reviewer_member_fk";
            columns: ["organization_id", "reviewed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      tip_allocations: {
        Row: {
          amount_cents: number;
          calculated_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          tip_pool_id: number;
        };
        Insert: {
          amount_cents: number;
          calculated_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          tip_pool_id: number;
        };
        Update: {
          amount_cents?: number;
          calculated_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          tip_pool_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_allocations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_allocations_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tip_allocations_tip_pool_id_organization_id_fkey";
            columns: ["tip_pool_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_pools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_interval_participants: {
        Row: {
          created_at: string;
          organization_id: string;
          profile_id: string;
          tip_interval_id: number;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          profile_id: string;
          tip_interval_id: number;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          profile_id?: string;
          tip_interval_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_interval_participants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_interval_participants_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tip_interval_participants_tip_interval_id_organization_id_fkey";
            columns: ["tip_interval_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_intervals";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_intervals: {
        Row: {
          amount_cents: number;
          created_at: string;
          ends_at: string;
          id: number;
          note: string | null;
          organization_id: string;
          starts_at: string;
          tip_pool_id: number;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          ends_at: string;
          id?: never;
          note?: string | null;
          organization_id: string;
          starts_at: string;
          tip_pool_id: number;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          ends_at?: string;
          id?: never;
          note?: string | null;
          organization_id?: string;
          starts_at?: string;
          tip_pool_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_intervals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_intervals_tip_pool_id_organization_id_fkey";
            columns: ["tip_pool_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_pools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_pools: {
        Row: {
          created_at: string;
          finalized_at: string | null;
          finalized_by: string | null;
          id: number;
          location_id: string;
          organization_id: string;
          service_date: string;
          status: Database["public"]["Enums"]["tip_pool_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: never;
          location_id: string;
          organization_id: string;
          service_date: string;
          status?: Database["public"]["Enums"]["tip_pool_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: never;
          location_id?: string;
          organization_id?: string;
          service_date?: string;
          status?: Database["public"]["Enums"]["tip_pool_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tip_pools_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tip_pools_organization_id_finalized_by_fkey";
            columns: ["organization_id", "finalized_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tip_pools_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      inventory_stock_status: {
        Row: {
          backup: number | null;
          cutoff: number | null;
          effective_warning: number | null;
          last_adjusted_at: string | null;
          location_id: string | null;
          on_hand: number | null;
          order_needed: boolean | null;
          organization_id: string | null;
          par: number | null;
          product_active: boolean | null;
          product_id: string | null;
          status: string | null;
          suggested_order: number | null;
          total: number | null;
          updated_at: string | null;
          updated_by: string | null;
          version: number | null;
          warning: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_stock_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_updater_fk";
            columns: ["organization_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
    };
    Functions: {
      bar_recipes_import: {
        Args: {
          p_actor_profile_id: string;
          p_mode: string;
          p_organization_id: string;
          p_overwrite?: number[];
          p_payload: Json;
        };
        Returns: Json;
      };
      board_add_column: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_server_profile_id: string;
          p_service_date: string;
        };
        Returns: number;
      };
      board_add_row: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: number;
      };
      board_assign: {
        Args: {
          p_confirm_transfer?: boolean;
          p_end_whole_assignment?: boolean;
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
          p_table_label: string;
        };
        Returns: number;
      };
      board_clear_board: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      board_clear_cell: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_clear_column: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_clear_row: {
        Args: {
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_delete_row: {
        Args: {
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_end_and_assign: {
        Args: {
          p_end_round_ids: number[];
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_table_label: string;
        };
        Returns: number;
      };
      board_end_previous_and_assign: {
        Args: {
          p_confirm_transfer?: boolean;
          p_end_whole_assignment?: boolean;
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
          p_table_label: string;
        };
        Returns: number;
      };
      board_end_table: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_move_column: {
        Args: {
          p_direction: string;
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_redo: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      board_set_column_status: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_status: string;
        };
        Returns: undefined;
      };
      board_skip_turn: {
        Args: {
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
        };
        Returns: number;
      };
      board_transfer: {
        Args: {
          p_dest_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_source_member_id: number;
          p_source_round_id: number;
        };
        Returns: number;
      };
      board_undo: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      checklist_generate_daily: {
        Args: {
          p_kind?: Database["public"]["Enums"]["checklist_kind"];
          p_location_id: string;
          p_organization_id: string;
          p_service_date?: string;
        };
        Returns: string[];
      };
      checklist_template_save: {
        Args: {
          p_active: boolean;
          p_days_of_week: number[];
          p_items: Json;
          p_kind: Database["public"]["Enums"]["checklist_kind"];
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_template_id: string;
        };
        Returns: string;
      };
      checklist_template_set_active: {
        Args: { p_active: boolean; p_template_id: string };
        Returns: undefined;
      };
      inventory_bootstrap: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: string;
      };
      inventory_category_create: {
        Args: {
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_category_set_active: {
        Args: {
          p_active: boolean;
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: number;
      };
      inventory_category_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: number;
      };
      inventory_import_commit: {
        Args: {
          p_batch_id: string;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_import_stage: {
        Args: {
          p_filename: string;
          p_format: string;
          p_location_id: string;
          p_organization_id: string;
          p_plan: Json;
          p_reason: string;
          p_request_id: string;
          p_sheet: string;
        };
        Returns: string;
      };
      inventory_order_draft_clear: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_fill: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_mode: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_mark_sent: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_open: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: string;
      };
      inventory_order_draft_save: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_lines: Json;
          p_location_id: string;
          p_organization_id: string;
          p_vendor_note: string;
        };
        Returns: Json;
      };
      inventory_order_draft_sync: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_product_create: {
        Args: {
          p_category_id: string;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_size: string;
          p_sku: string;
          p_subcategory_id: string;
          p_unit_label: string;
          p_unit_type: string;
          p_vendor_id: string;
        };
        Returns: string;
      };
      inventory_product_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_product_id: string;
        };
        Returns: number;
      };
      inventory_product_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_product_id: string;
          p_size: string;
          p_sku: string;
          p_subcategory_id: string;
          p_unit_label: string;
          p_unit_type: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      inventory_stock_adjust: {
        Args: {
          p_backup: number;
          p_expected_version: number;
          p_location_id: string;
          p_mode: string;
          p_note: string;
          p_on_hand: number;
          p_organization_id: string;
          p_product_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      inventory_stock_set_levels: {
        Args: {
          p_cutoff: number;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_par: number;
          p_product_id: string;
          p_warning: number;
        };
        Returns: number;
      };
      inventory_subcategory_create: {
        Args: {
          p_category_id: string;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_subcategory_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_subcategory_id: string;
        };
        Returns: number;
      };
      inventory_subcategory_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_subcategory_id: string;
        };
        Returns: number;
      };
      inventory_vendor_create: {
        Args: {
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_vendor_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      inventory_vendor_update: {
        Args: {
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      recalculate_tip_pool: {
        Args: { target_tip_pool_id: number };
        Returns: undefined;
      };
      task_assign: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_task_id: string;
        };
        Returns: undefined;
      };
      task_cancel: {
        Args: { p_reason?: string; p_task_id: string };
        Returns: undefined;
      };
      task_carry_forward: {
        Args: { p_new_due_date: string; p_task_ids: string[] };
        Returns: number;
      };
      task_complete: {
        Args: { p_note?: string; p_task_id: string };
        Returns: undefined;
      };
      task_create: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_due_date: string;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_each_person: boolean;
          p_instructions: string;
          p_location_id: string;
          p_organization_id: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_start_date: string;
          p_title: string;
        };
        Returns: string[];
      };
      task_notifications_mark_read: {
        Args: { p_ids?: number[] };
        Returns: number;
      };
      task_notifications_sweep: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_opening_reminders_sweep: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_recurrence_generate: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_reopen: { Args: { p_task_id: string }; Returns: undefined };
      task_series_create: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_day_of_month: number;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_end_type: Database["public"]["Enums"]["recurrence_end_type"];
          p_ends_on: string;
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          p_instructions: string;
          p_location_id: string;
          p_max_occurrences: number;
          p_organization_id: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_starts_on: string;
          p_title: string;
          p_weekdays: number[];
        };
        Returns: string;
      };
      task_series_stop: { Args: { p_rule_id: string }; Returns: number };
      task_series_update: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_day_of_month: number;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_end_type: Database["public"]["Enums"]["recurrence_end_type"];
          p_ends_on: string;
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          p_instructions: string;
          p_max_occurrences: number;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_rule_id: string;
          p_starts_on: string;
          p_title: string;
          p_weekdays: number[];
        };
        Returns: undefined;
      };
      task_set_status: {
        Args: {
          p_reason?: string;
          p_status: Database["public"]["Enums"]["task_status"];
          p_task_id: string;
        };
        Returns: undefined;
      };
      task_update: {
        Args: {
          p_category: string;
          p_due_date: string;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_instructions: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_start_date: string;
          p_task_id: string;
          p_title: string;
        };
        Returns: undefined;
      };
      unconfirm_payroll_payment: {
        Args: { p_payment_id: number; p_reason: string };
        Returns: undefined;
      };
    };
    Enums: {
      access_request_status: "pending" | "approved" | "declined";
      app_role:
        | "owner"
        | "general_manager"
        | "shift_manager"
        | "host"
        | "server";
      board_event_type:
        | "assign"
        | "add_column"
        | "pause_column"
        | "resume_column"
        | "remove_column"
        | "clear_row"
        | "clear_column"
        | "clear_board"
        | "undo"
        | "redo"
        | "move_column"
        | "add_row"
        | "clear_cell"
        | "delete_row"
        | "transfer"
        | "end"
        | "skip"
        | "end_and_assign";
      checklist_kind: "opening" | "closing";
      recurrence_end_type: "never" | "on_date" | "after_count";
      recurrence_frequency:
        | "daily"
        | "weekdays"
        | "weekly"
        | "selected_weekdays"
        | "monthly";
      request_status: "pending" | "approved" | "declined" | "cancelled";
      rotation_status: "active" | "paused" | "closing" | "unavailable";
      schedule_status: "draft" | "published" | "archived";
      seating_status: "seated" | "closed" | "cancelled" | "transferred";
      service_status: "planned" | "active" | "closed";
      shift_kind: "morning" | "evening" | "full_day";
      task_assignment_mode: "individual" | "multiple" | "all_team" | "anyone";
      task_due_window:
        | "before_opening"
        | "during_shift"
        | "before_dinner"
        | "closing"
        | "end_of_night";
      task_event_type:
        | "created"
        | "assigned"
        | "reassigned"
        | "edited"
        | "started"
        | "blocked"
        | "unblocked"
        | "completed"
        | "reopened"
        | "cancelled"
        | "carried_forward"
        | "recurrence_created"
        | "recurrence_changed"
        | "checklist_generated";
      task_kind: "task" | "opening" | "closing";
      task_notification_type:
        | "assigned"
        | "reassigned"
        | "due_soon"
        | "overdue"
        | "completed"
        | "checklist_available"
        | "opening_reminder";
      task_priority: "normal" | "high" | "urgent";
      task_status:
        | "open"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled";
      tip_pool_status: "draft" | "finalized";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_request_status: ["pending", "approved", "declined"],
      app_role: ["owner", "general_manager", "shift_manager", "host", "server"],
      board_event_type: [
        "assign",
        "add_column",
        "pause_column",
        "resume_column",
        "remove_column",
        "clear_row",
        "clear_column",
        "clear_board",
        "undo",
        "redo",
        "move_column",
        "add_row",
        "clear_cell",
        "delete_row",
        "transfer",
        "end",
        "skip",
        "end_and_assign",
      ],
      checklist_kind: ["opening", "closing"],
      recurrence_end_type: ["never", "on_date", "after_count"],
      recurrence_frequency: [
        "daily",
        "weekdays",
        "weekly",
        "selected_weekdays",
        "monthly",
      ],
      request_status: ["pending", "approved", "declined", "cancelled"],
      rotation_status: ["active", "paused", "closing", "unavailable"],
      schedule_status: ["draft", "published", "archived"],
      seating_status: ["seated", "closed", "cancelled", "transferred"],
      service_status: ["planned", "active", "closed"],
      shift_kind: ["morning", "evening", "full_day"],
      task_assignment_mode: ["individual", "multiple", "all_team", "anyone"],
      task_due_window: [
        "before_opening",
        "during_shift",
        "before_dinner",
        "closing",
        "end_of_night",
      ],
      task_event_type: [
        "created",
        "assigned",
        "reassigned",
        "edited",
        "started",
        "blocked",
        "unblocked",
        "completed",
        "reopened",
        "cancelled",
        "carried_forward",
        "recurrence_created",
        "recurrence_changed",
        "checklist_generated",
      ],
      task_kind: ["task", "opening", "closing"],
      task_notification_type: [
        "assigned",
        "reassigned",
        "due_soon",
        "overdue",
        "completed",
        "checklist_available",
        "opening_reminder",
      ],
      task_priority: ["normal", "high", "urgent"],
      task_status: ["open", "in_progress", "blocked", "completed", "cancelled"],
      tip_pool_status: ["draft", "finalized"],
    },
  },
} as const;
