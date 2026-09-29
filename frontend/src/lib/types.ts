export type Role = {
  id: number;
  name: string;
  description: string | null;
  is_admin: boolean;
  is_system: boolean;
  permissions: string[];
  user_count?: number;
};

export type UserBrief = { id: number; name: string; email: string; is_admin?: boolean };

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  is_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  lead_count?: number;
};

export type Me = User & { permissions: string[] };

export type Status = {
  id: number;
  name: string;
  color: string;
  order: number;
  category: "open" | "won" | "lost";
  is_default: boolean;
  show_in_pipeline: boolean;
};

export type Source = { id: number; name: string; key: string; color: string; order: number; is_active: boolean };
export type Priority = { id: number; name: string; color: string; order: number; is_default: boolean };
export type Tag = { id: number; name: string; color: string };

export type FieldType =
  | "text" | "number" | "email" | "phone" | "date" | "dropdown" | "multiselect" | "checkbox" | "textarea" | "currency";

export type CustomField = {
  id: number;
  name: string;
  key: string;
  field_type: FieldType;
  options: string[];
  required: boolean;
  show_in_list: boolean;
  is_active: boolean;
  order: number;
  placeholder: string | null;
};

export type Meta = {
  statuses: Status[];
  sources: Source[];
  priorities: Priority[];
  tags: Tag[];
  custom_fields: CustomField[];
  users: UserBrief[];
  field_types: FieldType[];
  shared_mode: boolean;
  company: { name: string; currency: string; currency_symbol: string; timezone: string };
  messaging: { country_code: string; templates: { name: string; text: string }[] };
};

export type Lead = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
  notes: string | null;
  source: Source | null;
  status: Status | null;
  priority: Priority | null;
  assigned_to: UserBrief | null;
  created_by: UserBrief | null;
  tags: Tag[];
  custom: Record<string, unknown>;
  enquiry_count: number;
  last_contact_at: string | null;
  next_followup_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Page<T> = { items: T[]; total: number; page?: number; page_size?: number };

export type Note = { id: number; lead_id: number; content: string; user: UserBrief | null; created_at: string };

export type Followup = {
  id: number;
  lead_id: number;
  lead?: { id: number; code: string; name: string; phone: string | null; company: string | null; status: Status | null } | null;
  assigned_to: UserBrief | null;
  due_at: string;
  type: string;
  note: string | null;
  status: "pending" | "done" | "cancelled";
  outcome: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  action: string;
  description: string;
  meta: Record<string, any> | null;
  ip: string | null;
  user: UserBrief | null;
  lead_id: number | null;
  lead_name?: string | null;
  lead_deleted?: boolean;
  created_at: string;
};

export type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  lead_id: number | null;
  is_read: boolean;
  created_at: string;
};
