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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          abandoned_at: string
          cart_snapshot: Json
          company_id: string | null
          company_name: string | null
          converted_order_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          items_count: number
          last_activity_at: string | null
          last_contacted_at: string | null
          lead_id: string | null
          notes: string | null
          origin_context: string | null
          origin_page: string | null
          origin_path: string | null
          recovered_at: string | null
          recovery_attempts: number
          status: string
          subtotal_amount: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          abandoned_at?: string
          cart_snapshot?: Json
          company_id?: string | null
          company_name?: string | null
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items_count?: number
          last_activity_at?: string | null
          last_contacted_at?: string | null
          lead_id?: string | null
          notes?: string | null
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          recovered_at?: string | null
          recovery_attempts?: number
          status?: string
          subtotal_amount?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          abandoned_at?: string
          cart_snapshot?: Json
          company_id?: string | null
          company_name?: string | null
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items_count?: number
          last_activity_at?: string | null
          last_contacted_at?: string | null
          lead_id?: string | null
          notes?: string | null
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          recovered_at?: string | null
          recovery_attempts?: number
          status?: string
          subtotal_amount?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          label: string | null
          neighborhood: string | null
          number: string
          recipient: string
          state: string
          street: string
          user_id: string
          zip_code: string
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          neighborhood?: string | null
          number: string
          recipient: string
          state: string
          street: string
          user_id: string
          zip_code: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          neighborhood?: string | null
          number?: string
          recipient?: string
          state?: string
          street?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string | null
          admin_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          description: string | null
          id: string
          ip: string | null
          resource_id: string | null
          resource_type: string
          source: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          ip?: string | null
          resource_id?: string | null
          resource_type: string
          source?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          ip?: string | null
          resource_id?: string | null
          resource_type?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          active: boolean
          channel: string
          config: Json
          created_at: string
          description: string | null
          id: string
          max_sends_per_entity: number
          name: string
          respect_consent: boolean
          template_id: string | null
          trigger_type: string
          updated_at: string
          wait_minutes: number
        }
        Insert: {
          active?: boolean
          channel?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          max_sends_per_entity?: number
          name: string
          respect_consent?: boolean
          template_id?: string | null
          trigger_type: string
          updated_at?: string
          wait_minutes?: number
        }
        Update: {
          active?: boolean
          channel?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          max_sends_per_entity?: number
          name?: string
          respect_consent?: boolean
          template_id?: string | null
          trigger_type?: string
          updated_at?: string
          wait_minutes?: number
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          channel: string
          created_at: string
          entity_id: string | null
          entity_type: string
          error_message: string | null
          generated_message: string | null
          id: string
          rule_id: string | null
          status: string
          trigger_kind: string
          triggered_by: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          generated_message?: string | null
          id?: string
          rule_id?: string | null
          status?: string
          trigger_kind?: string
          triggered_by?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          generated_message?: string | null
          id?: string
          rule_id?: string | null
          status?: string
          trigger_kind?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      b2b_negotiations: {
        Row: {
          admin_notes: string | null
          assigned_admin_id: string | null
          cart_snapshot: Json | null
          closed_at: string | null
          cnpj: string | null
          company_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_order_id: string | null
          created_at: string
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          message_sent: string | null
          product_id: string | null
          source: string
          status: Database["public"]["Enums"]["b2b_negotiation_status"]
          subtotal_b2b: number | null
          subtotal_retail: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_admin_id?: string | null
          cart_snapshot?: Json | null
          closed_at?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_order_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          message_sent?: string | null
          product_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["b2b_negotiation_status"]
          subtotal_b2b?: number | null
          subtotal_retail?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_admin_id?: string | null
          cart_snapshot?: Json | null
          closed_at?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_order_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          message_sent?: string | null
          product_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["b2b_negotiation_status"]
          subtotal_b2b?: number | null
          subtotal_retail?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_negotiations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_settings: {
        Row: {
          allow_bundle_discount_with_coupon: boolean
          allow_coupon_in_b2b: boolean
          benefits: Json
          created_at: string
          hero_description: string | null
          hero_image_url: string | null
          hero_primary_button_text: string | null
          hero_primary_button_url: string | null
          hero_secondary_button_text: string | null
          hero_secondary_button_url: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          institutional_text: string | null
          og_image_url: string | null
          require_admin_approval: boolean
          seo_description: string | null
          seo_title: string | null
          show_b2b_prices_to_guests: boolean
          updated_at: string
          vitrine_is_active: boolean
          vitrine_slug: string
          whatsapp_cta_text: string | null
        }
        Insert: {
          allow_bundle_discount_with_coupon?: boolean
          allow_coupon_in_b2b?: boolean
          benefits?: Json
          created_at?: string
          hero_description?: string | null
          hero_image_url?: string | null
          hero_primary_button_text?: string | null
          hero_primary_button_url?: string | null
          hero_secondary_button_text?: string | null
          hero_secondary_button_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          institutional_text?: string | null
          og_image_url?: string | null
          require_admin_approval?: boolean
          seo_description?: string | null
          seo_title?: string | null
          show_b2b_prices_to_guests?: boolean
          updated_at?: string
          vitrine_is_active?: boolean
          vitrine_slug?: string
          whatsapp_cta_text?: string | null
        }
        Update: {
          allow_bundle_discount_with_coupon?: boolean
          allow_coupon_in_b2b?: boolean
          benefits?: Json
          created_at?: string
          hero_description?: string | null
          hero_image_url?: string | null
          hero_primary_button_text?: string | null
          hero_primary_button_url?: string | null
          hero_secondary_button_text?: string | null
          hero_secondary_button_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          institutional_text?: string | null
          og_image_url?: string | null
          require_admin_approval?: boolean
          seo_description?: string | null
          seo_title?: string | null
          show_b2b_prices_to_guests?: boolean
          updated_at?: string
          vitrine_is_active?: boolean
          vitrine_slug?: string
          whatsapp_cta_text?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          qty: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          qty?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          qty?: number
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zipcode: string | null
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          blocked_at: string | null
          blocked_by: string | null
          cnpj: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role: string | null
          created_at: string
          id: string
          legal_name: string
          rejection_reason: string | null
          state_registration: string | null
          status: Database["public"]["Enums"]["company_status"]
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role?: string | null
          created_at?: string
          id?: string
          legal_name: string
          rejection_reason?: string | null
          state_registration?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          contact_role?: string | null
          created_at?: string
          id?: string
          legal_name?: string
          rejection_reason?: string | null
          state_registration?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zipcode: string | null
          business_hours: string | null
          cnpj: string | null
          created_at: string
          facebook_url: string | null
          id: string
          instagram_url: string | null
          legal_name: string | null
          linkedin_url: string | null
          logo_url: string | null
          municipal_registration: string | null
          pickup_address: string | null
          pickup_business_hours: string | null
          pickup_enabled: boolean
          pickup_instructions: string | null
          pickup_phone: string | null
          pickup_ready_eta: string | null
          pickup_store_name: string | null
          state_registration: string | null
          support_email: string | null
          support_phone: string | null
          support_whatsapp: string | null
          tiktok_url: string | null
          trade_name: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          business_hours?: string | null
          cnpj?: string | null
          created_at?: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          municipal_registration?: string | null
          pickup_address?: string | null
          pickup_business_hours?: string | null
          pickup_enabled?: boolean
          pickup_instructions?: string | null
          pickup_phone?: string | null
          pickup_ready_eta?: string | null
          pickup_store_name?: string | null
          state_registration?: string | null
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          tiktok_url?: string | null
          trade_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          business_hours?: string | null
          cnpj?: string | null
          created_at?: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          municipal_registration?: string | null
          pickup_address?: string | null
          pickup_business_hours?: string | null
          pickup_enabled?: boolean
          pickup_instructions?: string | null
          pickup_phone?: string | null
          pickup_ready_eta?: string | null
          pickup_store_name?: string | null
          state_registration?: string | null
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          tiktok_url?: string | null
          trade_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_user_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          metadata: Json | null
          name: string
          phone: string | null
          source: string
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          metadata?: Json | null
          name: string
          phone?: string | null
          source?: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          metadata?: Json | null
          name?: string
          phone?: string | null
          source?: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean | null
          code: string
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          min_order_value: number | null
          single_use_per_customer: boolean
          used_count: number | null
        }
        Insert: {
          active?: boolean | null
          code: string
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_value?: number | null
          single_use_per_customer?: boolean
          used_count?: number | null
        }
        Update: {
          active?: boolean | null
          code?: string
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_value?: number | null
          single_use_per_customer?: boolean
          used_count?: number | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          customer_email: string
          error_message: string | null
          id: string
          order_id: string | null
          payload: Json | null
          provider: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          type: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          type: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          type?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          allow_manual_resend: boolean
          auto_send: boolean
          created_at: string
          cta_label: string | null
          cta_url: string | null
          display_name: string
          headline: string | null
          id: string
          intro_html: string | null
          is_active: boolean
          preheader: string | null
          secondary_cta_label: string | null
          secondary_cta_url: string | null
          subject: string | null
          type: string
          updated_at: string
        }
        Insert: {
          allow_manual_resend?: boolean
          auto_send?: boolean
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          display_name: string
          headline?: string | null
          id?: string
          intro_html?: string | null
          is_active?: boolean
          preheader?: string | null
          secondary_cta_label?: string | null
          secondary_cta_url?: string | null
          subject?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          allow_manual_resend?: boolean
          auto_send?: boolean
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          display_name?: string
          headline?: string | null
          id?: string
          intro_html?: string | null
          is_active?: boolean
          preheader?: string | null
          secondary_cta_label?: string | null
          secondary_cta_url?: string | null
          subject?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      finance_settings: {
        Row: {
          alerts_baseline_at: string
          consider_b2b_discount_in_margin: boolean
          consider_coupon_in_margin: boolean
          consider_shipping_in_margin: boolean
          created_at: string
          critical_margin_alert_enabled: boolean
          critical_margin_threshold_percent: number
          default_currency: string
          default_min_margin_percent: number
          fiscal_company_data_completed: boolean
          fiscal_default_cfop_internal: string | null
          fiscal_default_cfop_interstate: string | null
          fiscal_default_nf_series: string | null
          fiscal_default_operation_nature: string | null
          fiscal_environment: string
          fiscal_main_cnae: string | null
          fiscal_observations: string | null
          fiscal_provider: string | null
          fiscal_tax_regime: string | null
          id: string
          invoice_default_cfop: string | null
          invoice_default_nature: string | null
          invoice_default_series: string | null
          invoice_environment: string
          invoice_provider: string | null
          invoice_required_min_value: number | null
          invoice_required_policy: string
          invoice_tax_regime: string | null
          mp_fee_boleto_fixed: number
          mp_fee_boleto_percent: number
          mp_fee_credit_fixed: number
          mp_fee_credit_percent: number
          mp_fee_default_percent: number
          mp_fee_pix_fixed: number
          mp_fee_pix_percent: number
          updated_at: string
        }
        Insert: {
          alerts_baseline_at?: string
          consider_b2b_discount_in_margin?: boolean
          consider_coupon_in_margin?: boolean
          consider_shipping_in_margin?: boolean
          created_at?: string
          critical_margin_alert_enabled?: boolean
          critical_margin_threshold_percent?: number
          default_currency?: string
          default_min_margin_percent?: number
          fiscal_company_data_completed?: boolean
          fiscal_default_cfop_internal?: string | null
          fiscal_default_cfop_interstate?: string | null
          fiscal_default_nf_series?: string | null
          fiscal_default_operation_nature?: string | null
          fiscal_environment?: string
          fiscal_main_cnae?: string | null
          fiscal_observations?: string | null
          fiscal_provider?: string | null
          fiscal_tax_regime?: string | null
          id?: string
          invoice_default_cfop?: string | null
          invoice_default_nature?: string | null
          invoice_default_series?: string | null
          invoice_environment?: string
          invoice_provider?: string | null
          invoice_required_min_value?: number | null
          invoice_required_policy?: string
          invoice_tax_regime?: string | null
          mp_fee_boleto_fixed?: number
          mp_fee_boleto_percent?: number
          mp_fee_credit_fixed?: number
          mp_fee_credit_percent?: number
          mp_fee_default_percent?: number
          mp_fee_pix_fixed?: number
          mp_fee_pix_percent?: number
          updated_at?: string
        }
        Update: {
          alerts_baseline_at?: string
          consider_b2b_discount_in_margin?: boolean
          consider_coupon_in_margin?: boolean
          consider_shipping_in_margin?: boolean
          created_at?: string
          critical_margin_alert_enabled?: boolean
          critical_margin_threshold_percent?: number
          default_currency?: string
          default_min_margin_percent?: number
          fiscal_company_data_completed?: boolean
          fiscal_default_cfop_internal?: string | null
          fiscal_default_cfop_interstate?: string | null
          fiscal_default_nf_series?: string | null
          fiscal_default_operation_nature?: string | null
          fiscal_environment?: string
          fiscal_main_cnae?: string | null
          fiscal_observations?: string | null
          fiscal_provider?: string | null
          fiscal_tax_regime?: string | null
          id?: string
          invoice_default_cfop?: string | null
          invoice_default_nature?: string | null
          invoice_default_series?: string | null
          invoice_environment?: string
          invoice_provider?: string | null
          invoice_required_min_value?: number | null
          invoice_required_policy?: string
          invoice_tax_regime?: string | null
          mp_fee_boleto_fixed?: number
          mp_fee_boleto_percent?: number
          mp_fee_credit_fixed?: number
          mp_fee_credit_percent?: number
          mp_fee_default_percent?: number
          mp_fee_pix_fixed?: number
          mp_fee_pix_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      home_banners: {
        Row: {
          active: boolean
          badge: string | null
          bg_color: string | null
          campaign_type: string
          created_at: string
          cta_label: string | null
          cta_link: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_desktop: string
          image_mobile: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          text_color: string | null
          title: string
          title_color: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          bg_color?: string | null
          campaign_type?: string
          created_at?: string
          cta_label?: string | null
          cta_link?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_desktop: string
          image_mobile?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          text_color?: string | null
          title: string
          title_color?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          bg_color?: string | null
          campaign_type?: string
          created_at?: string
          cta_label?: string | null
          cta_link?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_desktop?: string
          image_mobile?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          text_color?: string | null
          title?: string
          title_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      homepage_cards: {
        Row: {
          card_type: Database["public"]["Enums"]["homepage_card_type"]
          created_at: string
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_label: string | null
          link_url: string | null
          sort_order: number
          start_date: string | null
          title: string
          updated_at: string
          visual_variant: string | null
        }
        Insert: {
          card_type: Database["public"]["Enums"]["homepage_card_type"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          title: string
          updated_at?: string
          visual_variant?: string | null
        }
        Update: {
          card_type?: Database["public"]["Enums"]["homepage_card_type"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          title?: string
          updated_at?: string
          visual_variant?: string | null
        }
        Relationships: []
      }
      homepage_featured_categories: {
        Row: {
          category_id: string
          created_at: string
          custom_description: string | null
          custom_image_url: string | null
          custom_title: string | null
          icon: string | null
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_description?: string | null
          custom_image_url?: string | null
          custom_title?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_description?: string | null
          custom_image_url?: string | null
          custom_title?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_featured_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_product_showcases: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          mode: Database["public"]["Enums"]["homepage_showcase_mode"]
          product_limit: number
          show_view_all_button: boolean
          showcase_type: Database["public"]["Enums"]["homepage_showcase_type"]
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
          view_all_url: string | null
          visual_variant: Database["public"]["Enums"]["homepage_showcase_visual"]
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["homepage_showcase_mode"]
          product_limit?: number
          show_view_all_button?: boolean
          showcase_type?: Database["public"]["Enums"]["homepage_showcase_type"]
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
          view_all_url?: string | null
          visual_variant?: Database["public"]["Enums"]["homepage_showcase_visual"]
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["homepage_showcase_mode"]
          product_limit?: number
          show_view_all_button?: boolean
          showcase_type?: Database["public"]["Enums"]["homepage_showcase_type"]
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
          view_all_url?: string | null
          visual_variant?: Database["public"]["Enums"]["homepage_showcase_visual"]
        }
        Relationships: [
          {
            foreignKeyName: "homepage_product_showcases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_locked: boolean
          section_key: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_locked?: boolean
          section_key: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_locked?: boolean
          section_key?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      homepage_settings: {
        Row: {
          created_at: string
          hero_badge_icon: string | null
          hero_badge_text: string | null
          hero_description: string | null
          hero_highlight_text: string | null
          hero_is_active: boolean
          hero_logo_alt: string | null
          hero_logo_url: string | null
          hero_primary_button_active: boolean
          hero_primary_button_icon: string | null
          hero_primary_button_new_tab: boolean
          hero_primary_button_text: string | null
          hero_primary_button_url: string | null
          hero_secondary_button_active: boolean
          hero_secondary_button_icon: string | null
          hero_secondary_button_new_tab: boolean
          hero_secondary_button_text: string | null
          hero_secondary_button_url: string | null
          hero_subdescription: string | null
          hero_title: string | null
          id: string
          main_cta_background_color: string | null
          main_cta_button_active: boolean
          main_cta_button_color: string | null
          main_cta_button_text: string | null
          main_cta_button_url: string | null
          main_cta_description: string | null
          main_cta_icon: string | null
          main_cta_image_url: string | null
          main_cta_is_active: boolean
          main_cta_text_color: string | null
          main_cta_title: string | null
          og_image_url: string | null
          promo_bar_background_color: string | null
          promo_bar_ends_at: string | null
          promo_bar_icon: string | null
          promo_bar_is_active: boolean
          promo_bar_starts_at: string | null
          promo_bar_text: string | null
          promo_bar_text_color: string | null
          promo_bar_url: string | null
          seo_description: string | null
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero_badge_icon?: string | null
          hero_badge_text?: string | null
          hero_description?: string | null
          hero_highlight_text?: string | null
          hero_is_active?: boolean
          hero_logo_alt?: string | null
          hero_logo_url?: string | null
          hero_primary_button_active?: boolean
          hero_primary_button_icon?: string | null
          hero_primary_button_new_tab?: boolean
          hero_primary_button_text?: string | null
          hero_primary_button_url?: string | null
          hero_secondary_button_active?: boolean
          hero_secondary_button_icon?: string | null
          hero_secondary_button_new_tab?: boolean
          hero_secondary_button_text?: string | null
          hero_secondary_button_url?: string | null
          hero_subdescription?: string | null
          hero_title?: string | null
          id?: string
          main_cta_background_color?: string | null
          main_cta_button_active?: boolean
          main_cta_button_color?: string | null
          main_cta_button_text?: string | null
          main_cta_button_url?: string | null
          main_cta_description?: string | null
          main_cta_icon?: string | null
          main_cta_image_url?: string | null
          main_cta_is_active?: boolean
          main_cta_text_color?: string | null
          main_cta_title?: string | null
          og_image_url?: string | null
          promo_bar_background_color?: string | null
          promo_bar_ends_at?: string | null
          promo_bar_icon?: string | null
          promo_bar_is_active?: boolean
          promo_bar_starts_at?: string | null
          promo_bar_text?: string | null
          promo_bar_text_color?: string | null
          promo_bar_url?: string | null
          seo_description?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero_badge_icon?: string | null
          hero_badge_text?: string | null
          hero_description?: string | null
          hero_highlight_text?: string | null
          hero_is_active?: boolean
          hero_logo_alt?: string | null
          hero_logo_url?: string | null
          hero_primary_button_active?: boolean
          hero_primary_button_icon?: string | null
          hero_primary_button_new_tab?: boolean
          hero_primary_button_text?: string | null
          hero_primary_button_url?: string | null
          hero_secondary_button_active?: boolean
          hero_secondary_button_icon?: string | null
          hero_secondary_button_new_tab?: boolean
          hero_secondary_button_text?: string | null
          hero_secondary_button_url?: string | null
          hero_subdescription?: string | null
          hero_title?: string | null
          id?: string
          main_cta_background_color?: string | null
          main_cta_button_active?: boolean
          main_cta_button_color?: string | null
          main_cta_button_text?: string | null
          main_cta_button_url?: string | null
          main_cta_description?: string | null
          main_cta_icon?: string | null
          main_cta_image_url?: string | null
          main_cta_is_active?: boolean
          main_cta_text_color?: string | null
          main_cta_title?: string | null
          og_image_url?: string | null
          promo_bar_background_color?: string | null
          promo_bar_ends_at?: string | null
          promo_bar_icon?: string | null
          promo_bar_is_active?: boolean
          promo_bar_starts_at?: string | null
          promo_bar_text?: string | null
          promo_bar_text_color?: string | null
          promo_bar_url?: string | null
          seo_description?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      homepage_showcase_items: {
        Row: {
          combo_id: string | null
          created_at: string
          id: string
          is_active: boolean
          item_type: Database["public"]["Enums"]["homepage_showcase_item_type"]
          product_id: string | null
          showcase_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          combo_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_type: Database["public"]["Enums"]["homepage_showcase_item_type"]
          product_id?: string | null
          showcase_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          combo_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["homepage_showcase_item_type"]
          product_id?: string | null
          showcase_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_showcase_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_showcase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_showcase_items_showcase_id_fkey"
            columns: ["showcase_id"]
            isOneToOne: false
            referencedRelation: "homepage_product_showcases"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_pages: {
        Row: {
          content: string
          created_at: string
          excerpt: string | null
          id: string
          is_required: boolean
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          show_in_footer: boolean
          show_in_header: boolean
          slug: string
          sort_order: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          is_required?: boolean
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          show_in_footer?: boolean
          show_in_header?: boolean
          slug: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          is_required?: boolean
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          show_in_footer?: boolean
          show_in_header?: boolean
          slug?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lead_interactions: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          lead_id: string
          type: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id: string
          type?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          lead_id: string
          note: string | null
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          lead_id: string
          note?: string | null
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_admin_id: string | null
          company: string | null
          conversation_summary: string | null
          converted_order: string | null
          created_at: string | null
          email: string | null
          estimated_value: number | null
          id: string
          interest: string | null
          last_interaction_at: string | null
          last_user_message: string | null
          lost_reason: string | null
          metadata: Json | null
          name: string
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          origin: string | null
          origin_category_id: string | null
          origin_context: string | null
          origin_page: string | null
          origin_path: string | null
          origin_product_id: string | null
          origin_product_name: string | null
          page_url: string | null
          phone: string | null
          priority: string
          product_id: string | null
          product_name: string | null
          product_url: string | null
          referrer_url: string | null
          score: number
          score_reason: string | null
          score_temperature: string
          status: string | null
          tags: string[]
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp_message: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          company?: string | null
          conversation_summary?: string | null
          converted_order?: string | null
          created_at?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          interest?: string | null
          last_interaction_at?: string | null
          last_user_message?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          name: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          origin?: string | null
          origin_category_id?: string | null
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          origin_product_id?: string | null
          origin_product_name?: string | null
          page_url?: string | null
          phone?: string | null
          priority?: string
          product_id?: string | null
          product_name?: string | null
          product_url?: string | null
          referrer_url?: string | null
          score?: number
          score_reason?: string | null
          score_temperature?: string
          status?: string | null
          tags?: string[]
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_message?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          company?: string | null
          conversation_summary?: string | null
          converted_order?: string | null
          created_at?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          interest?: string | null
          last_interaction_at?: string | null
          last_user_message?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          name?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          origin?: string | null
          origin_category_id?: string | null
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          origin_product_id?: string | null
          origin_product_name?: string | null
          page_url?: string | null
          phone?: string | null
          priority?: string
          product_id?: string | null
          product_name?: string | null
          product_url?: string | null
          referrer_url?: string | null
          score?: number
          score_reason?: string | null
          score_temperature?: string
          status?: string | null
          tags?: string[]
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_order_fkey"
            columns: ["converted_order"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      local_delivery_zone_aliases: {
        Row: {
          alias_name: string
          alias_normalized: string
          created_at: string
          id: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          alias_name: string
          alias_normalized: string
          created_at?: string
          id?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          alias_name?: string
          alias_normalized?: string
          created_at?: string
          id?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_delivery_zone_aliases_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "local_delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      local_delivery_zones: {
        Row: {
          city: string
          created_at: string
          display_name: string
          district: string
          estimated_delivery_time: string | null
          id: string
          inherits_parent_price: boolean
          is_active: boolean
          is_alias: boolean
          name: string
          normalized_name: string
          notes: string | null
          parent_zone_id: string | null
          shipping_price: number | null
          sort_order: number
          state: string
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          display_name: string
          district: string
          estimated_delivery_time?: string | null
          id?: string
          inherits_parent_price?: boolean
          is_active?: boolean
          is_alias?: boolean
          name: string
          normalized_name: string
          notes?: string | null
          parent_zone_id?: string | null
          shipping_price?: number | null
          sort_order?: number
          state?: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          display_name?: string
          district?: string
          estimated_delivery_time?: string | null
          id?: string
          inherits_parent_price?: boolean
          is_active?: boolean
          is_alias?: boolean
          name?: string
          normalized_name?: string
          notes?: string | null
          parent_zone_id?: string | null
          shipping_price?: number | null
          sort_order?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_delivery_zones_parent_zone_id_fkey"
            columns: ["parent_zone_id"]
            isOneToOne: false
            referencedRelation: "local_delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_generations: {
        Row: {
          admin_email: string | null
          admin_user_id: string
          applied_campaign_id: string | null
          applied_payload: Json | null
          brief: Json
          created_at: string
          id: string
          model: string | null
          status: string
          suggestion: Json
          updated_at: string
        }
        Insert: {
          admin_email?: string | null
          admin_user_id: string
          applied_campaign_id?: string | null
          applied_payload?: Json | null
          brief?: Json
          created_at?: string
          id?: string
          model?: string | null
          status?: string
          suggestion?: Json
          updated_at?: string
        }
        Update: {
          admin_email?: string | null
          admin_user_id?: string
          applied_campaign_id?: string | null
          applied_payload?: Json | null
          brief?: Json
          created_at?: string
          id?: string
          model?: string | null
          status?: string
          suggestion?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ai_generations_applied_campaign_id_fkey"
            columns: ["applied_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience: string | null
          banner_id: string | null
          base_url: string | null
          budget_planned: number | null
          budget_spent: number | null
          category_ids: string[]
          channel: string | null
          click_count: number | null
          combo_ids: string[]
          content: string | null
          coupon_id: string | null
          created_at: string | null
          description: string | null
          email_template_id: string | null
          ends_at: string | null
          final_url: string | null
          id: string
          landing_page_url: string | null
          name: string
          notes: string | null
          objective: string | null
          open_count: number | null
          owner_name: string | null
          priority: string
          product_ids: string[]
          scheduled_at: string | null
          sent_count: number | null
          show_on_b2b: boolean
          show_on_catalog: boolean
          show_on_home: boolean
          starts_at: string | null
          status: string | null
          subject: string | null
          tags: string[]
          target_leads: number | null
          target_sales: number | null
          type: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp_template_id: string | null
        }
        Insert: {
          audience?: string | null
          banner_id?: string | null
          base_url?: string | null
          budget_planned?: number | null
          budget_spent?: number | null
          category_ids?: string[]
          channel?: string | null
          click_count?: number | null
          combo_ids?: string[]
          content?: string | null
          coupon_id?: string | null
          created_at?: string | null
          description?: string | null
          email_template_id?: string | null
          ends_at?: string | null
          final_url?: string | null
          id?: string
          landing_page_url?: string | null
          name: string
          notes?: string | null
          objective?: string | null
          open_count?: number | null
          owner_name?: string | null
          priority?: string
          product_ids?: string[]
          scheduled_at?: string | null
          sent_count?: number | null
          show_on_b2b?: boolean
          show_on_catalog?: boolean
          show_on_home?: boolean
          starts_at?: string | null
          status?: string | null
          subject?: string | null
          tags?: string[]
          target_leads?: number | null
          target_sales?: number | null
          type?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_template_id?: string | null
        }
        Update: {
          audience?: string | null
          banner_id?: string | null
          base_url?: string | null
          budget_planned?: number | null
          budget_spent?: number | null
          category_ids?: string[]
          channel?: string | null
          click_count?: number | null
          combo_ids?: string[]
          content?: string | null
          coupon_id?: string | null
          created_at?: string | null
          description?: string | null
          email_template_id?: string | null
          ends_at?: string | null
          final_url?: string | null
          id?: string
          landing_page_url?: string | null
          name?: string
          notes?: string | null
          objective?: string | null
          open_count?: number | null
          owner_name?: string | null
          priority?: string
          product_ids?: string[]
          scheduled_at?: string | null
          sent_count?: number | null
          show_on_b2b?: boolean
          show_on_catalog?: boolean
          show_on_home?: boolean
          starts_at?: string | null
          status?: string | null
          subject?: string | null
          tags?: string[]
          target_leads?: number | null
          target_sales?: number | null
          type?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_template_id?: string | null
        }
        Relationships: []
      }
      marketing_creatives: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string | null
          creative_type: string
          focus: string | null
          generation_id: string | null
          id: string
          is_principal: boolean
          metadata: Json
          origin: string
          prompt: string | null
          public_url: string
          status: string
          storage_path: string
          style: string | null
          tone: string | null
          updated_at: string
          variation_index: number
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          creative_type: string
          focus?: string | null
          generation_id?: string | null
          id?: string
          is_principal?: boolean
          metadata?: Json
          origin?: string
          prompt?: string | null
          public_url: string
          status?: string
          storage_path: string
          style?: string | null
          tone?: string | null
          updated_at?: string
          variation_index?: number
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          creative_type?: string
          focus?: string | null
          generation_id?: string | null
          id?: string
          is_principal?: boolean
          metadata?: Json
          origin?: string
          prompt?: string | null
          public_url?: string
          status?: string
          storage_path?: string
          style?: string | null
          tone?: string | null
          updated_at?: string
          variation_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_creatives_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "marketing_ai_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_integrations: {
        Row: {
          account_id: string
          consent_category: string
          created_at: string
          enabled: boolean
          id: string
          notes: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          account_id: string
          consent_category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          consent_category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_invoice_audit: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          event_type: string
          id: string
          new_data: Json | null
          new_status: string | null
          notes: string | null
          order_id: string
          previous_data: Json | null
          previous_status: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_data?: Json | null
          new_status?: string | null
          notes?: string | null
          order_id: string
          previous_data?: Json | null
          previous_status?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_data?: Json | null
          new_status?: string | null
          notes?: string | null
          order_id?: string
          previous_data?: Json | null
          previous_status?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          applied_unit_price: number | null
          b2b_discount_total: number
          b2b_discount_unit: number
          b2b_min_quantity: number | null
          b2b_rule_applied: string | null
          b2b_unit_price: number | null
          bundle_applied: boolean
          bundle_block_reason: string | null
          bundle_discount_amount: number
          bundle_discount_eligible: boolean
          bundle_id: string | null
          bundle_name: string | null
          cost_source: string
          gross_margin_amount: number | null
          gross_margin_percent: number | null
          id: string
          order_id: string
          pricing_source: string
          product_id: string | null
          product_image: string | null
          product_name: string
          product_sku: string | null
          qty: number
          retail_unit_price: number | null
          total_cost: number | null
          total_price: number
          unit_cost: number | null
          unit_price: number
        }
        Insert: {
          applied_unit_price?: number | null
          b2b_discount_total?: number
          b2b_discount_unit?: number
          b2b_min_quantity?: number | null
          b2b_rule_applied?: string | null
          b2b_unit_price?: number | null
          bundle_applied?: boolean
          bundle_block_reason?: string | null
          bundle_discount_amount?: number
          bundle_discount_eligible?: boolean
          bundle_id?: string | null
          bundle_name?: string | null
          cost_source?: string
          gross_margin_amount?: number | null
          gross_margin_percent?: number | null
          id?: string
          order_id: string
          pricing_source?: string
          product_id?: string | null
          product_image?: string | null
          product_name: string
          product_sku?: string | null
          qty: number
          retail_unit_price?: number | null
          total_cost?: number | null
          total_price: number
          unit_cost?: number | null
          unit_price: number
        }
        Update: {
          applied_unit_price?: number | null
          b2b_discount_total?: number
          b2b_discount_unit?: number
          b2b_min_quantity?: number | null
          b2b_rule_applied?: string | null
          b2b_unit_price?: number | null
          bundle_applied?: boolean
          bundle_block_reason?: string | null
          bundle_discount_amount?: number
          bundle_discount_eligible?: boolean
          bundle_id?: string | null
          bundle_name?: string | null
          cost_source?: string
          gross_margin_amount?: number | null
          gross_margin_percent?: number | null
          id?: string
          order_id?: string
          pricing_source?: string
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          product_sku?: string | null
          qty?: number
          retail_unit_price?: number | null
          total_cost?: number | null
          total_price?: number
          unit_cost?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json | null
          order_id: string
          status: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id: string
          status?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string
          status?: string | null
          type?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address_id: string | null
          address_snapshot: Json | null
          admin_notes: string | null
          b2b_discount_total: number
          b2b_subtotal: number | null
          bundle_discount_details: Json | null
          bundle_discount_total: number
          cancelled_reason: string | null
          checkout_url: string | null
          company_cnpj: string | null
          company_contact_name: string | null
          company_id: string | null
          company_name: string | null
          coupon_code: string | null
          created_at: string | null
          delivery_method: string
          discount: number
          estimated_delivery: string | null
          estimated_fee_amount: number | null
          estimated_net_amount: number | null
          external_reference: string | null
          has_bundle_discount: boolean
          id: string
          invoice_access_key: string | null
          invoice_danfe_url: string | null
          invoice_issued_at: string | null
          invoice_notes: string | null
          invoice_number: string | null
          invoice_registered_at: string | null
          invoice_registered_by: string | null
          invoice_required: boolean
          invoice_series: string | null
          invoice_status: string
          invoice_updated_at: string | null
          invoice_url: string | null
          invoice_xml_url: string | null
          local_delivery_district: string | null
          local_delivery_eta: string | null
          local_delivery_zone_id: string | null
          mp_fee_amount: number | null
          mp_fee_details: Json | null
          mp_gross_amount: number | null
          mp_last_webhook_at: string | null
          mp_merchant_order_id: string | null
          mp_net_amount: number | null
          mp_payment_id: string | null
          mp_payment_method: string | null
          mp_payment_type: string | null
          mp_preference_id: string | null
          mp_webhook_error: string | null
          mp_webhook_status: string | null
          notes: string | null
          order_number: number
          order_type: string
          origin_context: string | null
          origin_page: string | null
          origin_path: string | null
          paid_at: string | null
          payment_error: string | null
          payment_fee_calculated_at: string | null
          payment_fee_source: string
          payment_id: string | null
          payment_link: string | null
          payment_method: string | null
          payment_provider: string
          payment_status: string | null
          pickup_instructions: string | null
          pickup_status: string | null
          pickup_store_address: string | null
          pickup_store_name: string | null
          pickup_store_phone: string | null
          pricing_validated_at: string | null
          public_access_token: string | null
          referrer_url: string | null
          retail_subtotal: number | null
          shipping_carrier: string | null
          shipping_cost: number
          shipping_service: string | null
          status: string
          stock_decremented_at: string | null
          subtotal: number
          total: number
          tracking_code: string | null
          updated_at: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          address_id?: string | null
          address_snapshot?: Json | null
          admin_notes?: string | null
          b2b_discount_total?: number
          b2b_subtotal?: number | null
          bundle_discount_details?: Json | null
          bundle_discount_total?: number
          cancelled_reason?: string | null
          checkout_url?: string | null
          company_cnpj?: string | null
          company_contact_name?: string | null
          company_id?: string | null
          company_name?: string | null
          coupon_code?: string | null
          created_at?: string | null
          delivery_method?: string
          discount?: number
          estimated_delivery?: string | null
          estimated_fee_amount?: number | null
          estimated_net_amount?: number | null
          external_reference?: string | null
          has_bundle_discount?: boolean
          id?: string
          invoice_access_key?: string | null
          invoice_danfe_url?: string | null
          invoice_issued_at?: string | null
          invoice_notes?: string | null
          invoice_number?: string | null
          invoice_registered_at?: string | null
          invoice_registered_by?: string | null
          invoice_required?: boolean
          invoice_series?: string | null
          invoice_status?: string
          invoice_updated_at?: string | null
          invoice_url?: string | null
          invoice_xml_url?: string | null
          local_delivery_district?: string | null
          local_delivery_eta?: string | null
          local_delivery_zone_id?: string | null
          mp_fee_amount?: number | null
          mp_fee_details?: Json | null
          mp_gross_amount?: number | null
          mp_last_webhook_at?: string | null
          mp_merchant_order_id?: string | null
          mp_net_amount?: number | null
          mp_payment_id?: string | null
          mp_payment_method?: string | null
          mp_payment_type?: string | null
          mp_preference_id?: string | null
          mp_webhook_error?: string | null
          mp_webhook_status?: string | null
          notes?: string | null
          order_number?: never
          order_type?: string
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          paid_at?: string | null
          payment_error?: string | null
          payment_fee_calculated_at?: string | null
          payment_fee_source?: string
          payment_id?: string | null
          payment_link?: string | null
          payment_method?: string | null
          payment_provider?: string
          payment_status?: string | null
          pickup_instructions?: string | null
          pickup_status?: string | null
          pickup_store_address?: string | null
          pickup_store_name?: string | null
          pickup_store_phone?: string | null
          pricing_validated_at?: string | null
          public_access_token?: string | null
          referrer_url?: string | null
          retail_subtotal?: number | null
          shipping_carrier?: string | null
          shipping_cost?: number
          shipping_service?: string | null
          status?: string
          stock_decremented_at?: string | null
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json | null
          admin_notes?: string | null
          b2b_discount_total?: number
          b2b_subtotal?: number | null
          bundle_discount_details?: Json | null
          bundle_discount_total?: number
          cancelled_reason?: string | null
          checkout_url?: string | null
          company_cnpj?: string | null
          company_contact_name?: string | null
          company_id?: string | null
          company_name?: string | null
          coupon_code?: string | null
          created_at?: string | null
          delivery_method?: string
          discount?: number
          estimated_delivery?: string | null
          estimated_fee_amount?: number | null
          estimated_net_amount?: number | null
          external_reference?: string | null
          has_bundle_discount?: boolean
          id?: string
          invoice_access_key?: string | null
          invoice_danfe_url?: string | null
          invoice_issued_at?: string | null
          invoice_notes?: string | null
          invoice_number?: string | null
          invoice_registered_at?: string | null
          invoice_registered_by?: string | null
          invoice_required?: boolean
          invoice_series?: string | null
          invoice_status?: string
          invoice_updated_at?: string | null
          invoice_url?: string | null
          invoice_xml_url?: string | null
          local_delivery_district?: string | null
          local_delivery_eta?: string | null
          local_delivery_zone_id?: string | null
          mp_fee_amount?: number | null
          mp_fee_details?: Json | null
          mp_gross_amount?: number | null
          mp_last_webhook_at?: string | null
          mp_merchant_order_id?: string | null
          mp_net_amount?: number | null
          mp_payment_id?: string | null
          mp_payment_method?: string | null
          mp_payment_type?: string | null
          mp_preference_id?: string | null
          mp_webhook_error?: string | null
          mp_webhook_status?: string | null
          notes?: string | null
          order_number?: never
          order_type?: string
          origin_context?: string | null
          origin_page?: string | null
          origin_path?: string | null
          paid_at?: string | null
          payment_error?: string | null
          payment_fee_calculated_at?: string | null
          payment_fee_source?: string
          payment_id?: string | null
          payment_link?: string | null
          payment_method?: string | null
          payment_provider?: string
          payment_status?: string | null
          pickup_instructions?: string | null
          pickup_status?: string | null
          pickup_store_address?: string | null
          pickup_store_name?: string | null
          pickup_store_phone?: string | null
          pricing_validated_at?: string | null
          public_access_token?: string | null
          referrer_url?: string | null
          retail_subtotal?: number | null
          shipping_carrier?: string | null
          shipping_cost?: number
          shipping_service?: string | null
          status?: string
          stock_decremented_at?: string | null
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_local_delivery_zone_id_fkey"
            columns: ["local_delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "local_delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          action: string | null
          created_at: string
          data_id: string | null
          event_id: string | null
          headers: Json | null
          id: string
          live_mode: boolean | null
          payload: Json
          processed: boolean
          processing_error: string | null
          provider: string
          type: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          data_id?: string | null
          event_id?: string | null
          headers?: Json | null
          id?: string
          live_mode?: boolean | null
          payload: Json
          processed?: boolean
          processing_error?: string | null
          provider?: string
          type?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          data_id?: string | null
          event_id?: string | null
          headers?: Json | null
          id?: string
          live_mode?: boolean | null
          payload?: Json
          processed?: boolean
          processing_error?: string | null
          provider?: string
          type?: string | null
        }
        Relationships: []
      }
      product_attribute_labels: {
        Row: {
          attribute_key: string
          created_at: string
          display_label: string
          helper_text: string | null
          id: string
          is_active: boolean
          raw_value: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attribute_key: string
          created_at?: string
          display_label: string
          helper_text?: string | null
          id?: string
          is_active?: boolean
          raw_value: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attribute_key?: string
          created_at?: string
          display_label?: string
          helper_text?: string | null
          id?: string
          is_active?: boolean
          raw_value?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_attributes: {
        Row: {
          attribute_key: string
          attribute_label: string
          attribute_unit: string | null
          attribute_value: string
          created_at: string
          id: string
          is_filterable: boolean
          is_visible: boolean
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attribute_key: string
          attribute_label: string
          attribute_unit?: string | null
          attribute_value: string
          created_at?: string
          id?: string
          is_filterable?: boolean
          is_visible?: boolean
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attribute_key?: string
          attribute_label?: string
          attribute_unit?: string | null
          attribute_value?: string
          created_at?: string
          id?: string
          is_filterable?: boolean
          is_visible?: boolean
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundle_images: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          is_primary: boolean
          sort_order: number
          source: string
          updated_at: string
          url: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          sort_order?: number
          source?: string
          updated_at?: string
          url: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          sort_order?: number
          source?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_images_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          is_required: boolean
          product_id: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          product_id: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          product_id?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundles: {
        Row: {
          accepts_coupon: boolean
          available_b2b: boolean
          available_retail: boolean
          b2b_extra_discount_percent: number | null
          b2b_fixed_price: number | null
          b2b_min_quantity: number
          b2b_pricing_method: string
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          discount_type: Database["public"]["Enums"]["bundle_discount_type"]
          discount_value: number
          end_date: string | null
          fixed_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          kit_type: string
          name: string
          notes: string | null
          pricing_method: string
          slug: string | null
          stack_with_b2b: boolean
          start_date: string | null
          updated_at: string
        }
        Insert: {
          accepts_coupon?: boolean
          available_b2b?: boolean
          available_retail?: boolean
          b2b_extra_discount_percent?: number | null
          b2b_fixed_price?: number | null
          b2b_min_quantity?: number
          b2b_pricing_method?: string
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: Database["public"]["Enums"]["bundle_discount_type"]
          discount_value?: number
          end_date?: string | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          kit_type?: string
          name: string
          notes?: string | null
          pricing_method?: string
          slug?: string | null
          stack_with_b2b?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          accepts_coupon?: boolean
          available_b2b?: boolean
          available_retail?: boolean
          b2b_extra_discount_percent?: number | null
          b2b_fixed_price?: number | null
          b2b_min_quantity?: number
          b2b_pricing_method?: string
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: Database["public"]["Enums"]["bundle_discount_type"]
          discount_value?: number
          end_date?: string | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          kit_type?: string
          name?: string
          notes?: string | null
          pricing_method?: string
          slug?: string | null
          stack_with_b2b?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          id: string
          is_primary: boolean
          optimized: boolean
          original_format: string | null
          original_size: number | null
          original_url: string
          product_id: string
          seo_filename: string | null
          sort_order: number
          title_text: string | null
          url_card: string | null
          url_full: string | null
          url_og: string | null
          url_thumb: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          optimized?: boolean
          original_format?: string | null
          original_size?: number | null
          original_url: string
          product_id: string
          seo_filename?: string | null
          sort_order?: number
          title_text?: string | null
          url_card?: string | null
          url_full?: string | null
          url_og?: string | null
          url_thumb?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          optimized?: boolean
          original_format?: string | null
          original_size?: number | null
          original_url?: string
          product_id?: string
          seo_filename?: string | null
          sort_order?: number
          title_text?: string | null
          url_card?: string | null
          url_full?: string | null
          url_og?: string | null
          url_thumb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          related_product_id: string
          relation_type: Database["public"]["Enums"]["product_relation_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          related_product_id: string
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          related_product_id?: string
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_review_messages: {
        Row: {
          author_type: string
          author_user_id: string
          created_at: string
          id: string
          message: string
          review_id: string
        }
        Insert: {
          author_type: string
          author_user_id: string
          created_at?: string
          id?: string
          message: string
          review_id: string
        }
        Update: {
          author_type?: string
          author_user_id?: string
          created_at?: string
          id?: string
          message?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_review_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_review_messages_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string
          created_at: string
          id: string
          is_hidden: boolean
          order_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_options: {
        Row: {
          created_at: string
          display_type: string
          id: string
          option_title: string
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_type?: string
          id?: string
          option_title: string
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_type?: string
          id?: string
          option_title?: string
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          allow_out_of_stock_sales: boolean
          avg_rating: number
          b2b_commercial_note: string | null
          b2b_enabled: boolean
          b2b_min_qty: number | null
          b2b_price: number | null
          b2b_qty_multiple: number | null
          b2b_show_in_vitrine: boolean
          b2b_valid_until: string | null
          brand: string | null
          category_id: string | null
          cest: string | null
          cfop_default: string | null
          commercial_unit: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          fiscal_description: string | null
          fiscal_enabled: boolean
          fiscal_notes: string | null
          fiscal_score: number
          fiscal_status: string
          fiscal_updated_at: string | null
          free_shipping_eligible: boolean
          gross_weight: number | null
          gtin_ean: string | null
          gtin_tax: string | null
          height_cm: number | null
          id: string
          images: string[] | null
          length_cm: number | null
          min_margin_percent: number | null
          name: string
          ncm: string | null
          net_weight: number | null
          parent_product_id: string | null
          price: number
          product_origin: number | null
          review_count: number
          sale_price: number | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          sku: string | null
          slug: string
          specs: Json | null
          stock_alert_enabled: boolean
          stock_min_alert: number | null
          stock_qty: number
          tags: string[] | null
          tax_category: string | null
          tributary_unit: string | null
          updated_at: string | null
          variant_attributes: Json
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          active?: boolean | null
          allow_out_of_stock_sales?: boolean
          avg_rating?: number
          b2b_commercial_note?: string | null
          b2b_enabled?: boolean
          b2b_min_qty?: number | null
          b2b_price?: number | null
          b2b_qty_multiple?: number | null
          b2b_show_in_vitrine?: boolean
          b2b_valid_until?: string | null
          brand?: string | null
          category_id?: string | null
          cest?: string | null
          cfop_default?: string | null
          commercial_unit?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          fiscal_description?: string | null
          fiscal_enabled?: boolean
          fiscal_notes?: string | null
          fiscal_score?: number
          fiscal_status?: string
          fiscal_updated_at?: string | null
          free_shipping_eligible?: boolean
          gross_weight?: number | null
          gtin_ean?: string | null
          gtin_tax?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          length_cm?: number | null
          min_margin_percent?: number | null
          name: string
          ncm?: string | null
          net_weight?: number | null
          parent_product_id?: string | null
          price: number
          product_origin?: number | null
          review_count?: number
          sale_price?: number | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          sku?: string | null
          slug: string
          specs?: Json | null
          stock_alert_enabled?: boolean
          stock_min_alert?: number | null
          stock_qty?: number
          tags?: string[] | null
          tax_category?: string | null
          tributary_unit?: string | null
          updated_at?: string | null
          variant_attributes?: Json
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          active?: boolean | null
          allow_out_of_stock_sales?: boolean
          avg_rating?: number
          b2b_commercial_note?: string | null
          b2b_enabled?: boolean
          b2b_min_qty?: number | null
          b2b_price?: number | null
          b2b_qty_multiple?: number | null
          b2b_show_in_vitrine?: boolean
          b2b_valid_until?: string | null
          brand?: string | null
          category_id?: string | null
          cest?: string | null
          cfop_default?: string | null
          commercial_unit?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          fiscal_description?: string | null
          fiscal_enabled?: boolean
          fiscal_notes?: string | null
          fiscal_score?: number
          fiscal_status?: string
          fiscal_updated_at?: string | null
          free_shipping_eligible?: boolean
          gross_weight?: number | null
          gtin_ean?: string | null
          gtin_tax?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          length_cm?: number | null
          min_margin_percent?: number | null
          name?: string
          ncm?: string | null
          net_weight?: number | null
          parent_product_id?: string | null
          price?: number
          product_origin?: number | null
          review_count?: number
          sale_price?: number | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          sku?: string | null
          slug?: string
          specs?: Json | null
          stock_alert_enabled?: boolean
          stock_min_alert?: number | null
          stock_qty?: number
          tags?: string[] | null
          tax_category?: string | null
          tributary_unit?: string | null
          updated_at?: string | null
          variant_attributes?: Json
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          phone: string | null
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          name: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          identifier: string
          metadata: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          identifier: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          identifier?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          normalized_term: string
          results_count: number
          search_term: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_term: string
          results_count?: number
          search_term: string
          source?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          normalized_term?: string
          results_count?: number
          search_term?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          id: string
          identifier: string | null
          message: string | null
          metadata: Json | null
          severity: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier?: string | null
          message?: string | null
          metadata?: Json | null
          severity?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string | null
          message?: string | null
          metadata?: Json | null
          severity?: string
          type?: string
        }
        Relationships: []
      }
      stock_decrement_audit: {
        Row: {
          created_at: string
          id: string
          items: Json
          note: string | null
          order_id: string
          result: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          order_id: string
          result: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          order_id?: string
          result?: string
        }
        Relationships: []
      }
      stock_settings: {
        Row: {
          alert_inactive_product_enabled: boolean
          alert_low_stock_enabled: boolean
          alert_out_of_stock_enabled: boolean
          created_at: string
          default_min_stock: number
          high_movement_min_qty: number
          id: string
          inactive_days_threshold: number
          sales_window_days: number
          updated_at: string
        }
        Insert: {
          alert_inactive_product_enabled?: boolean
          alert_low_stock_enabled?: boolean
          alert_out_of_stock_enabled?: boolean
          created_at?: string
          default_min_stock?: number
          high_movement_min_qty?: number
          id?: string
          inactive_days_threshold?: number
          sales_window_days?: number
          updated_at?: string
        }
        Update: {
          alert_inactive_product_enabled?: boolean
          alert_low_stock_enabled?: boolean
          alert_out_of_stock_enabled?: boolean
          created_at?: string
          default_min_stock?: number
          high_movement_min_qty?: number
          id?: string
          inactive_days_threshold?: number
          sales_window_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          body: string
          category: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          variables: string[]
        }
        Insert: {
          active?: boolean
          body: string
          category?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          variables?: string[]
        }
        Update: {
          active?: boolean
          body?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          variables?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_product: {
        Args: { p_id: string }
        Returns: {
          active: boolean | null
          allow_out_of_stock_sales: boolean
          avg_rating: number
          b2b_commercial_note: string | null
          b2b_enabled: boolean
          b2b_min_qty: number | null
          b2b_price: number | null
          b2b_qty_multiple: number | null
          b2b_show_in_vitrine: boolean
          b2b_valid_until: string | null
          brand: string | null
          category_id: string | null
          cest: string | null
          cfop_default: string | null
          commercial_unit: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          fiscal_description: string | null
          fiscal_enabled: boolean
          fiscal_notes: string | null
          fiscal_score: number
          fiscal_status: string
          fiscal_updated_at: string | null
          free_shipping_eligible: boolean
          gross_weight: number | null
          gtin_ean: string | null
          gtin_tax: string | null
          height_cm: number | null
          id: string
          images: string[] | null
          length_cm: number | null
          min_margin_percent: number | null
          name: string
          ncm: string | null
          net_weight: number | null
          parent_product_id: string | null
          price: number
          product_origin: number | null
          review_count: number
          sale_price: number | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          sku: string | null
          slug: string
          specs: Json | null
          stock_alert_enabled: boolean
          stock_min_alert: number | null
          stock_qty: number
          tags: string[] | null
          tax_category: string | null
          tributary_unit: string | null
          updated_at: string | null
          variant_attributes: Json
          weight_kg: number | null
          width_cm: number | null
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_products: {
        Args: never
        Returns: {
          active: boolean | null
          allow_out_of_stock_sales: boolean
          avg_rating: number
          b2b_commercial_note: string | null
          b2b_enabled: boolean
          b2b_min_qty: number | null
          b2b_price: number | null
          b2b_qty_multiple: number | null
          b2b_show_in_vitrine: boolean
          b2b_valid_until: string | null
          brand: string | null
          category_id: string | null
          cest: string | null
          cfop_default: string | null
          commercial_unit: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          fiscal_description: string | null
          fiscal_enabled: boolean
          fiscal_notes: string | null
          fiscal_score: number
          fiscal_status: string
          fiscal_updated_at: string | null
          free_shipping_eligible: boolean
          gross_weight: number | null
          gtin_ean: string | null
          gtin_tax: string | null
          height_cm: number | null
          id: string
          images: string[] | null
          length_cm: number | null
          min_margin_percent: number | null
          name: string
          ncm: string | null
          net_weight: number | null
          parent_product_id: string | null
          price: number
          product_origin: number | null
          review_count: number
          sale_price: number | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          sku: string | null
          slug: string
          specs: Json | null
          stock_alert_enabled: boolean
          stock_min_alert: number | null
          stock_qty: number
          tags: string[] | null
          tax_category: string | null
          tributary_unit: string | null
          updated_at: string | null
          variant_attributes: Json
          weight_kg: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      apply_coupon:
        | {
            Args: { _code: string; _subtotal: number }
            Returns: {
              discount: number
              message: string
              valid: boolean
            }[]
          }
        | {
            Args: { _code: string; _subtotal: number; _user_id?: string }
            Returns: {
              discount: number
              message: string
              valid: boolean
            }[]
          }
      audit_jsonb_diff: { Args: { _after: Json; _before: Json }; Returns: Json }
      autocomplete_products_public: {
        Args: { _limit?: number; _terms: string[] }
        Returns: {
          brand: string
          id: string
          image: string
          kind: string
          name: string
          price: number
          relevance: number
          sale_price: number
          slug: string
        }[]
      }
      check_rate_limit: {
        Args: {
          _action: string
          _identifier: string
          _max_attempts: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after_seconds: number
        }[]
      }
      cleanup_old_events: { Args: { _days?: number }; Returns: Json }
      cleanup_rate_limit_events: { Args: never; Returns: number }
      decrement_stock_for_order: {
        Args: { _order_id: string }
        Returns: {
          decremented: boolean
          reason: string
        }[]
      }
      detect_abandoned_carts: {
        Args: { _minutes?: number }
        Returns: {
          created_count: number
          skipped_count: number
        }[]
      }
      get_cart_complementary_products: {
        Args: { _limit?: number; _product_ids: string[]; _user_id?: string }
        Returns: {
          applied_price: number
          brand: string
          free_shipping_eligible: boolean
          image: string
          match_count: number
          name: string
          pricing_source: string
          product_id: string
          retail_price: number
          sale_price: number
          slug: string
          stock_qty: number
        }[]
      }
      get_catalog_attribute_facets: {
        Args: { _category_id?: string; _keys?: string[] }
        Returns: {
          attribute_key: string
          attribute_label: string
          attribute_unit: string
          attribute_value: string
          product_count: number
        }[]
      }
      get_commercial_review_counters: { Args: never; Returns: Json }
      get_commercial_sales_aggregate: {
        Args: { _sales_window_days?: number }
        Returns: {
          bundle_discount_window: number
          last_sold_at: string
          orders_count_window: number
          product_id: string
          qty_sold_window: number
          revenue_window: number
        }[]
      }
      get_homepage_showcases_public: { Args: never; Returns: Json }
      get_product_relations_public: {
        Args: { _limit?: number; _product_id: string; _user_id?: string }
        Returns: {
          applied_price: number
          b2b_min_quantity: number
          brand: string
          free_shipping_eligible: boolean
          image: string
          name: string
          pricing_source: string
          product_id: string
          relation_id: string
          relation_type: Database["public"]["Enums"]["product_relation_type"]
          retail_price: number
          sale_price: number
          slug: string
          sort_order: number
          stock_qty: number
        }[]
      }
      get_stock_counters: { Args: never; Returns: Json }
      get_stock_report: {
        Args: { _sales_window_days?: number }
        Returns: {
          active: boolean
          allow_out_of_stock_sales: boolean
          category_id: string
          category_name: string
          created_at: string
          last_sold_at: string
          name: string
          product_id: string
          qty_sold_window: number
          sku: string
          stock_alert_enabled: boolean
          stock_min_alert: number
          stock_qty: number
        }[]
      }
      get_user_approved_company_id: {
        Args: { _user_id: string }
        Returns: string
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      import_product_with_attrs: {
        Args: { _attrs: Json; _mode: string; _payload: Json }
        Returns: Json
      }
      increment_coupon_usage: { Args: { _code: string }; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          _action: string
          _admin_email: string
          _admin_id: string
          _after: Json
          _before: Json
          _description: string
          _ip: string
          _resource_id: string
          _resource_type: string
          _user_agent: string
        }
        Returns: string
      }
      log_security_event: {
        Args: {
          _identifier: string
          _message: string
          _metadata: Json
          _severity: string
          _type: string
        }
        Returns: string
      }
      lookup_local_delivery_zone: {
        Args: { _city: string; _neighborhood: string; _state: string }
        Returns: {
          display_name: string
          district: string
          estimated_delivery_time: string
          has_price: boolean
          is_active: boolean
          matched_via: string
          shipping_price: number
          zone_id: string
        }[]
      }
      normalize_zone_name: { Args: { _text: string }; Returns: string }
      recalculate_lead_score: { Args: { _lead_id: string }; Returns: undefined }
      resolve_codes_bulk: {
        Args: { _items: Json; _user_id: string }
        Returns: {
          applied_preview_price: number
          available_stock: number
          b2b_discount_amount: number
          b2b_discount_percent: number
          b2b_enabled: boolean
          b2b_min_quantity: number
          b2b_price: number
          b2b_qty_multiple: number
          brand: string
          category_id: string
          ean: string
          has_stock: boolean
          image_url: string
          line_index: number
          match_status: string
          matched_via: string
          multiple_options: Json
          normalized_code: string
          original_code: string
          pricing_source_preview: string
          product_id: string
          product_name: string
          product_slug: string
          requested_quantity: number
          retail_price: number
          sale_price: number
          sku: string
          warnings: string[]
        }[]
      }
      search_normalize: { Args: { _text: string }; Returns: string }
      search_products_public:
        | {
            Args: {
              _b2b_only?: boolean
              _brand?: string
              _category_id?: string
              _free_shipping?: boolean
              _in_stock?: boolean
              _limit?: number
              _min_qty_max?: number
              _offset?: number
              _on_sale?: boolean
              _price_max?: number
              _price_min?: number
              _sort?: string
              _terms?: string[]
            }
            Returns: {
              b2b_enabled: boolean
              b2b_min_qty: number
              b2b_price: number
              b2b_qty_multiple: number
              b2b_show_in_vitrine: boolean
              b2b_valid_until: string
              brand: string
              category_id: string
              featured: boolean
              free_shipping_eligible: boolean
              id: string
              images: string[]
              name: string
              price: number
              relevance: number
              sale_price: number
              slug: string
              stock_qty: number
              tags: string[]
              total_count: number
            }[]
          }
        | {
            Args: {
              _attr_filters?: Json
              _b2b_only?: boolean
              _brand?: string
              _category_id?: string
              _free_shipping?: boolean
              _in_stock?: boolean
              _limit?: number
              _min_qty_max?: number
              _offset?: number
              _on_sale?: boolean
              _price_max?: number
              _price_min?: number
              _sort?: string
              _terms?: string[]
            }
            Returns: {
              b2b_enabled: boolean
              b2b_min_qty: number
              b2b_price: number
              b2b_qty_multiple: number
              b2b_show_in_vitrine: boolean
              b2b_valid_until: string
              brand: string
              category_id: string
              featured: boolean
              free_shipping_eligible: boolean
              id: string
              images: string[]
              name: string
              price: number
              relevance: number
              sale_price: number
              slug: string
              stock_qty: number
              tags: string[]
              total_count: number
            }[]
          }
      sync_product_images_array: {
        Args: { _product_id: string }
        Returns: undefined
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_purchased_product: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
      validate_b2b_pricing: {
        Args: { _items: Json; _user_id: string }
        Returns: Json
      }
      validate_cart_bundles: {
        Args: { _has_coupon?: boolean; _items: Json; _user_id: string }
        Returns: {
          bundle_id: string
          bundle_image: string
          bundle_name: string
          bundle_slug: string
          considered_items: Json
          discount_type: string
          discount_value: number
          eligible_subtotal: number
          estimated_discount: number
          missing_items: Json
          reason: string
          status: string
          warnings: string[]
        }[]
      }
    }
    Enums: {
      b2b_negotiation_status:
        | "nova"
        | "em_atendimento"
        | "proposta_enviada"
        | "aguardando_cliente"
        | "convertida_em_pedido"
        | "perdida"
        | "cancelada"
      bundle_discount_type: "none" | "fixed_amount" | "percentage"
      company_status: "pending" | "approved" | "blocked" | "rejected"
      company_user_role: "owner" | "member"
      homepage_card_type: "benefit" | "promo"
      homepage_showcase_item_type: "product" | "combo"
      homepage_showcase_mode: "auto" | "manual"
      homepage_showcase_type:
        | "featured"
        | "offers"
        | "best_sellers"
        | "new_arrivals"
        | "category"
        | "bundles"
        | "custom"
      homepage_showcase_visual:
        | "default"
        | "premium"
        | "compact"
        | "highlighted"
      product_relation_type:
        | "related"
        | "frequently_bought_together"
        | "accessory"
        | "replacement"
        | "upsell"
        | "cross_sell"
        | "b2b_recommendation"
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
      b2b_negotiation_status: [
        "nova",
        "em_atendimento",
        "proposta_enviada",
        "aguardando_cliente",
        "convertida_em_pedido",
        "perdida",
        "cancelada",
      ],
      bundle_discount_type: ["none", "fixed_amount", "percentage"],
      company_status: ["pending", "approved", "blocked", "rejected"],
      company_user_role: ["owner", "member"],
      homepage_card_type: ["benefit", "promo"],
      homepage_showcase_item_type: ["product", "combo"],
      homepage_showcase_mode: ["auto", "manual"],
      homepage_showcase_type: [
        "featured",
        "offers",
        "best_sellers",
        "new_arrivals",
        "category",
        "bundles",
        "custom",
      ],
      homepage_showcase_visual: [
        "default",
        "premium",
        "compact",
        "highlighted",
      ],
      product_relation_type: [
        "related",
        "frequently_bought_together",
        "accessory",
        "replacement",
        "upsell",
        "cross_sell",
        "b2b_recommendation",
      ],
    },
  },
} as const
