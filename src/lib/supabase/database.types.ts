
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "blocks": {
                  Row: {
                    "details": string | null,"done": boolean,"id": string,"kind": string,"minutes": number,"owner_id": string,"place": Json | null,"rest": string | null,"start": string,"task_id": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "details"?: string | null,"done"?: boolean,"id"?: string,"kind": string,"minutes": number,"owner_id"?: string,"place"?: Json | null,"rest"?: string | null,"start": string,"task_id"?: string | null,"title"?: string | null
                  }
                  Update: {
                    "details"?: string | null,"done"?: boolean,"id"?: string,"kind"?: string,"minutes"?: number,"owner_id"?: string,"place"?: Json | null,"rest"?: string | null,"start"?: string,"task_id"?: string | null,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "created_at": string,"days": (number)[],"ends_on": string | null,"id": string,"minutes": number,"owner_id": string,"place": string | null,"start": string,"starts_on": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"days": (number)[],"ends_on"?: string | null,"id"?: string,"minutes": number,"owner_id"?: string,"place"?: string | null,"start": string,"starts_on"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"days"?: (number)[],"ends_on"?: string | null,"id"?: string,"minutes"?: number,"owner_id"?: string,"place"?: string | null,"start"?: string,"starts_on"?: string | null,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"day_limits": {
                  Row: {
                    "day": string,"deep": boolean,"id": string,"minutes": number,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"deep"?: boolean,"id"?: string,"minutes": number,"owner_id"?: string
                  }
                  Update: {
                    "day"?: string,"deep"?: boolean,"id"?: string,"minutes"?: number,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dismissals": {
                  Row: {
                    "at": string,"id": string,"owner_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: string,"owner_id"?: string,"task_id": string
                  }
                  Update: {
                    "at"?: string,"id"?: string,"owner_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dismissals_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"feeds": {
                  Row: {
                    "id": string,"imported_at": string | null,"name": string,"owner_id": string,"planned_at": string | null,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"imported_at"?: string | null,"name": string,"owner_id"?: string,"planned_at"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "id"?: string,"imported_at"?: string | null,"name"?: string,"owner_id"?: string,"planned_at"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "active_hours": (number)[] | null,"break_minutes": number,"clock": string | null,"focus_minutes": number,"lockdown": boolean,"nights": Json | null,"origin": Json | null,"owner_id": string,"places": NonNullable<Json>,"planning_since": string | null,"preferences": NonNullable<Json>,"time_zone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_hours"?: (number)[] | null,"break_minutes"?: number,"clock"?: string | null,"focus_minutes"?: number,"lockdown"?: boolean,"nights"?: Json | null,"origin"?: Json | null,"owner_id"?: string,"places"?: NonNullable<Json>,"planning_since"?: string | null,"preferences"?: NonNullable<Json>,"time_zone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active_hours"?: (number)[] | null,"break_minutes"?: number,"clock"?: string | null,"focus_minutes"?: number,"lockdown"?: boolean,"nights"?: Json | null,"origin"?: Json | null,"owner_id"?: string,"places"?: NonNullable<Json>,"planning_since"?: string | null,"preferences"?: NonNullable<Json>,"time_zone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "course": string | null,"deliverable": string | null,"done": boolean,"due": string,"feed_id": string,"fingerprint": string,"id": string,"minutes": number | null,"owner_id": string,"read": boolean,"requirements": (string)[],"title": string,"uid": string,"url": string | null,"work": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "course"?: string | null,"deliverable"?: string | null,"done"?: boolean,"due": string,"feed_id": string,"fingerprint": string,"id"?: string,"minutes"?: number | null,"owner_id"?: string,"read"?: boolean,"requirements"?: (string)[],"title": string,"uid": string,"url"?: string | null,"work"?: string | null
                  }
                  Update: {
                    "course"?: string | null,"deliverable"?: string | null,"done"?: boolean,"due"?: string,"feed_id"?: string,"fingerprint"?: string,"id"?: string,"minutes"?: number | null,"owner_id"?: string,"read"?: boolean,"requirements"?: (string)[],"title"?: string,"uid"?: string,"url"?: string | null,"work"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_feed_id_fkey"
      columns: ["feed_id"]
isOneToOne: false
      referencedRelation: "feeds"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
