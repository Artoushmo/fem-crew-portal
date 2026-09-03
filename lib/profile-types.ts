export type Craft =
  | 'photographer'
  | 'videographer'
  | 'drone-operator'
  | 'editor'
  | 'assistant'
  | 'lighting'
  | 'audio'
  | 'photo-editor'
  | 'motion-design'
  | 'web-design'
  | 'app-design';

export const CRAFT_LABEL: Record<Craft, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  'drone-operator': 'Drone operator',
  editor: 'Editor',
  assistant: 'Assistant',
  lighting: 'Lighting',
  audio: 'Audio',
  'photo-editor': 'Photo editor',
  'motion-design': 'Motion design',
  'web-design': 'Web design',
  'app-design': 'App design',
};

export const CRAFTS = Object.keys(CRAFT_LABEL) as Craft[];

export type GearCategory =
  | 'camera'
  | 'lens'
  | 'lighting'
  | 'audio'
  | 'drone'
  | 'support'
  | 'other';

export const GEAR_LABEL: Record<GearCategory, string> = {
  camera: 'Bodies',
  lens: 'Lenses',
  lighting: 'Lighting',
  audio: 'Audio',
  drone: 'Drone',
  support: 'Support',
  other: 'Other',
};

export const GEAR_CATEGORIES = Object.keys(GEAR_LABEL) as GearCategory[];

export type CredentialKind = 'drone-licence' | 'insurance' | 'certification' | 'other';

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = {
  'drone-licence': 'Drone licence',
  insurance: 'Insurance',
  certification: 'Certification',
  other: 'Other',
};

export const CREDENTIAL_KINDS = Object.keys(CREDENTIAL_LABEL) as CredentialKind[];

export interface ProfileRow {
  id: string;
  role: 'freelancer' | 'staff' | 'admin';
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  base_city: string | null;
  country: string | null;
  bio: string | null;
  travel_radius_km: number | null;
  travel_scope: TravelScope;
  notice_hours: number | null;
  company_name: string | null;
  coc_number: string | null;
  vat_number: string | null;
  iban: string | null;
}

export interface CraftRow {
  profile_id: string;
  craft: Craft;
  is_primary: boolean;
  years_experience: number | null;
}

export interface GearRow {
  id: string;
  profile_id: string;
  category: GearCategory;
  brand: string | null;
  model: string;
  quantity: number;
  notes: string | null;
}

export interface CredentialRow {
  id: string;
  profile_id: string;
  kind: CredentialKind;
  label: string;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  document_path: string | null;
}

/** Fields FEM needs before a freelancer can sensibly be matched to a job. */
/** How far someone will go. A radius in kilometres read precisely and matched
    nothing -- what decides a booking is whether they leave their region, the
    country, or neither. */
export type TravelScope = 'region' | 'nl' | 'international';

export const TRAVEL_SCOPE_LABEL: Record<TravelScope, string> = {
  region: 'My own region',
  nl: 'Anywhere in the Netherlands',
  international: 'Netherlands and abroad',
};

export const TRAVEL_SCOPES = Object.keys(TRAVEL_SCOPE_LABEL) as TravelScope[];

export const REQUIRED_FOR_MATCHING = [
  'full_name',
  'phone',
  'base_city',
  'travel_scope',
] as const;

export function profileCompleteness(
  profile: ProfileRow | null,
  crafts: CraftRow[],
  gear: GearRow[],
) {
  const checks = [
    { key: 'Name and contact', done: Boolean(profile?.full_name && profile?.phone) },
    { key: 'Where you work', done: Boolean(profile?.base_city && profile?.travel_scope) },
    { key: 'What you do', done: crafts.length > 0 },
    { key: 'Your kit', done: gear.length > 0 },
    { key: 'Invoicing details', done: Boolean(profile?.iban && profile?.vat_number) },
  ];

  return {
    checks,
    done: checks.filter((c) => c.done).length,
    total: checks.length,
  };
}
