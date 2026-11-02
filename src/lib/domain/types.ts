// Tipos de domínio espelham as tabelas da base de dados (supabase/migrations).
export type AppRole =
  | 'superadmin' | 'org_admin' | 'supplier' | 'buyer'
  | 'procurement_qualifier' | 'doc_operator' | 'auditor' | 'inspector'
export type OrgType = 'supplier' | 'buyer' | 'both'
export type ProfileStatus =
  | 'draft' | 'incomplete' | 'submitted' | 'under_review'
  | 'approved' | 'corrections_pending' | 'suspended' | 'rejected'
export type VerificationStatus = 'not_verified' | 'in_progress' | 'verified'
export type OrgVisibility = 'private' | 'platform' | 'public'
export type DocStatus =
  | 'submitted' | 'under_review' | 'approved' | 'correction_pending' | 'rejected' | 'superseded'
export type ReviewResult = 'approved' | 'rejected' | 'correction_requested'
export type OpportunityStatus =
  | 'draft' | 'published' | 'invites_sent' | 'open' | 'under_evaluation'
  | 'clarification' | 'closed' | 'awarded' | 'cancelled' | 'archived'
export type ProposalStatus =
  | 'draft' | 'submitted' | 'in_evaluation' | 'withdrawn' | 'rejected' | 'selected'
export type DecisionResult = 'awarded' | 'no_award'

export interface Organization {
  id: string
  legal_name: string
  trade_name: string | null
  nif: string | null
  commercial_registry?: string | null
  org_type: OrgType
  sector: string | null
  province: string | null
  municipality: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  contact_person: string | null
  description: string | null
  founded_year: number | null
  employee_count: number | null
  capabilities: string | null
  certifications_declared: string[]
  profile_status: ProfileStatus
  profile_review_reason?: string | null
  verification_status: VerificationStatus
  verification_scope: string | null
  verified_at: string | null
  visibility: OrgVisibility
  visibility_consent_at?: string | null
  public_fields?: string[]
  is_active: boolean
  submitted_at?: string | null
  profile_updated_at: string
  created_at?: string
}

/** Linha da vista supplier_directory (campos opcionais já mascarados pelo servidor). */
export interface DirectoryEntry extends Omit<Organization, 'is_active' | 'created_at'> {
  category_ids: string[]
  service_text: string
  service_count: number
  valid_doc_type_ids: string[]
}

export interface Category {
  id: string; parent_id: string | null; name: string; slug: string
  description: string | null; sort_order: number; is_active: boolean
}
export interface Service {
  id: string; organization_id: string; category_id: string; name: string
  description: string | null; specialties: string[]; areas: string[]
}
export interface DocumentType {
  id: string; code: string; name: string; description: string | null
  requires_expiry: boolean; alert_days: number[]; max_size_mb: number
  allowed_mime: string[]; is_active: boolean; sort_order: number
}
export interface QualificationRequirement {
  id: string; name: string; description: string | null; document_type_id: string
  category_id: string | null; min_validity_days: number; is_mandatory: boolean; is_active: boolean
}
export interface DocumentRow {
  id: string; organization_id: string; document_type_id: string; title: string
  current_version: number; reference_number: string | null
  issue_date: string | null; valid_until: string | null; status: DocStatus
  submitted_at: string; reviewed_by: string | null; reviewed_at: string | null
  review_reason: string | null; file_name: string; file_size: number; mime_type: string
  created_at: string; updated_at: string
}
export interface DocumentVersion {
  id: string; document_id: string; version: number; storage_path: string; file_name: string
  file_size: number; reference_number: string | null; issue_date: string | null
  valid_until: string | null; status: DocStatus; submitted_at: string
}
export interface DocumentReview {
  id: string; document_id: string; version_id: string; reviewer_id: string
  result: ReviewResult; reason: string | null; reviewed_at: string
}
export interface Opportunity {
  id: string; number: string; buyer_org_id: string; title: string; description: string | null
  category_id: string | null; responsible_id: string | null; delivery_location: string | null
  deadline: string; currency: string; commercial_terms: string | null
  technical_requirements: string | null; required_document_type_ids: string[]
  visibility: 'invited_only' | 'open_to_qualified'; sealed_until_deadline: boolean
  status: OpportunityStatus; duplicate_of: string | null; published_at: string | null
  closed_at: string | null; created_at: string; updated_at: string
}
export interface OpportunityItem {
  id: string; opportunity_id: string; position: number; description: string
  quantity: number; unit: string; technical_spec: string | null
}
export interface EvaluationCriterion {
  id: string; opportunity_id: string; position: number; name: string
  description: string | null; weight: number; kind: 'technical' | 'commercial'
}
export interface DeadlineExtension {
  id: string; opportunity_id: string; supplier_org_id: string | null
  previous_deadline: string; new_deadline: string; reason: string; created_at: string
}
export interface Invitation {
  id: string; opportunity_id: string; supplier_org_id: string
  status: 'sent' | 'viewed' | 'declined' | 'responded'
  invited_at: string; viewed_at: string | null; responded_at: string | null
}
export interface Clarification {
  id: string; opportunity_id: string; supplier_org_id: string; question: string
  asked_at: string; answer: string | null; answered_at: string | null; published_as_notice: boolean
}
export interface Notice { id: string; opportunity_id: string; title: string; body: string; created_at: string }
export interface Proposal {
  id: string; number: string; opportunity_id: string; supplier_org_id: string
  current_version: number; status: ProposalStatus; submitted_at: string | null
  first_submitted_at: string | null; receipt_code: string | null
  validity_until: string | null; delivery_days: number | null; currency: string
  commercial_terms: string | null; notes: string | null
  subtotal: number; discount_total: number; tax_total: number; total: number
  created_at: string
}
export interface ProposalItem {
  id: string; proposal_id: string; opportunity_item_id: string; description: string
  quantity: number; unit: string; unit_price: number; discount_pct: number; tax_pct: number
  line_gross: number; line_discount: number; line_subtotal: number; line_tax: number; line_total: number
}
export interface ProposalVersion {
  id: string; proposal_id: string; version: number; total: number; currency: string
  submitted_at: string; snapshot: unknown
}
export interface Evaluation {
  id: string; proposal_id: string; criterion_id: string; evaluator_id: string
  score: number; comment: string | null
}
export interface CommercialDecision {
  id: string; opportunity_id: string; result: DecisionResult; proposal_id: string | null
  approved_amount: number | null; currency: string | null; rationale: string
  decided_by: string; decided_at: string
}
export interface AppNotification {
  id: string; type: string; title: string; body: string | null; entity_type: string | null
  entity_id: string | null; read_at: string | null; created_at: string
}
export interface AuditLog {
  id: number; actor_id: string | null; organization_id: string | null; action: string
  entity_type: string | null; entity_id: string | null; details: Record<string, unknown>; created_at: string
}

export interface Membership {
  organization_id: string
  organization: Pick<Organization, 'id' | 'legal_name' | 'trade_name' | 'org_type' | 'profile_status' | 'verification_status'> & { nif: string }
  roles: AppRole[]
  permissions: string[]
}
export interface UserContext {
  profile: { id: string; full_name: string; phone: string | null; job_title: string | null; is_active: boolean }
  is_superadmin: boolean
  memberships: Membership[]
  platform_permissions: string[]
}

export type InspectionStatus = 'draft' | 'submitted' | 'approved' | 'returned'
export interface InspectionMap {
  id: string; number: string; organization_id: string; title: string; vessel_name: string | null; voyage_ref: string | null
  bl_ref: string | null; port_location: string | null; cargo_description: string | null; cargo_owner: string | null
  inspection_date: string; tolerance_pct: number; inspector_id: string | null; status: InspectionStatus; notes: string | null
  submitted_at: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null
  created_by: string | null; created_at: string; updated_at: string
}
export interface InspectionLine {
  id: string; map_id: string; position: number; hold_ref: string | null; item_description: string; lot_ref: string | null; unit: string
  declared_qty: number; counted_qty: number; damaged_qty: number; unit_weight_kg: number | null; condition: string | null; notes: string | null
  diff_qty: number; good_qty: number; diff_pct: number | null; line_weight_kg: number | null
}
export type ScanMethod = 'webxr_hit_test' | 'webxr_depth' | 'imported_model' | 'simulated' | 'manual'
export interface HoldScan {
  id: string; organization_id: string; inspection_map_id: string | null; title: string; hold_ref: string | null; method: ScanMethod
  device: Record<string, unknown>; stats: Record<string, unknown>; model_path: string | null; model_format: string | null
  model_bytes: number | null; notes: string | null; created_by: string | null; created_at: string
}
export interface ScanValidation {
  id: string; organization_id: string; scan_id: string | null; device_label: string; method: ScanMethod; reference_label: string
  physical_value: number; physical_instrument: string | null; physical_uncertainty: number | null; scanned_value: number
  conditions: string | null; measured_by: string; measured_at: string; error_abs: number; error_pct: number
}
