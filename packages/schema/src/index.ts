export interface EvidenceBundleVersion {

  collector: string;
  playwright: string;
  chromium: string;
  axe_core: string;

  extractor: string;

  sampling_policy_version: string;

  vantage_region: string;
}

export type ScanMode = 'quick' | 'full';

export type IntegrityReason =
  | 'http_error'
  | 'challenge_page'
  | 'content_too_short'
  | 'navigation_timeout'
  | 'wrong_content_type'
  | 'redirected_offsite';

export interface CollectionIntegrity {
  ok: boolean;
  reasons: IntegrityReason[];
  notes?: string;
}

export interface HeadingFact {
  level: number;
  text: string;

  faux?: boolean;
}

export interface ImageFact {
  src: string;
  alt: string | null;

  decorative: boolean;

  junkAlt: boolean;
  width: number;
  height: number;
}

export interface LinkFact {
  href: string;
  text: string;
  ariaLabel: string | null;

  nondescriptive: boolean;
  external: boolean;

  document: boolean;
  newWindow: boolean;
}

export interface FormFact {
  action: string | null;
  method: string;
  fieldCount: number;
  requiredCount: number;
  hasTextarea: boolean;

  unlabelledCount: number;
}

export interface MediaFact {
  kind: 'video' | 'audio' | 'iframe-embed';
  src: string;
  autoplay: boolean;
  muted: boolean;
  hasCaptionsTrack: boolean;
  hasDescriptionsTrack: boolean;
}

export interface FeedbackFact {

  phrase: string | null;

  sentimentControl: boolean;

  freeText: boolean;

  accessibleName: string | null;

  requiresIdentity: boolean;

  genericContactOnly: boolean;
}

export interface CssFacts {
  prefersColorScheme: boolean;
  prefersReducedMotion: boolean;
  prefersContrast: boolean;
  forcedColors: boolean;
  hasPrintStylesheet: boolean;

  justifiedBlocks: number;

  allCapsBlocks: number;
}

export interface ViewportProbe {
  width: number;
  scrollWidth: number;
  innerWidth: number;

  horizontalOverflow: boolean;
}

export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodeCount: number;

  sampleTargets: string[];
}

export interface AxeSummary {
  violations: AxeViolation[];

  incompleteCount: number;
  passCount: number;
}

export interface DomFacts {
  title: string;
  lang: string | null;
  h1Count: number;
  headings: HeadingFact[];
  landmarks: { main: number; nav: number; banner: number; contentinfo: number };
  skipLink: { present: boolean; firstFocusable: boolean; text: string | null };
  images: ImageFact[];
  links: LinkFact[];
  forms: FormFact[];
  media: MediaFact[];
  feedback: FeedbackFact | null;
  metaViewport: string | null;

  zoomBlocked: boolean;
  metaRefresh: boolean;

  smallTargets: number;
  interactiveCount: number;

  personalisationControls: string[];
  cookieBanner: boolean;
}

export interface PageEvidence {
  page_id: string;
  url: string;
  final_url: string;
  status: number;
  redirect_chain: string[];
  headers: Record<string, string>;
  content_type: string | null;
  bytes: number;
  timing: { ttfb_ms: number; dom_content_loaded_ms: number; load_ms: number };

  html: string;

  main_text: string;
  main_word_count: number;
  dom: DomFacts;
  css: CssFacts;
  axe: AxeSummary;

  viewports: ViewportProbe[];

  third_party_hosts: string[];
  console_errors: number;
  integrity: CollectionIntegrity;
}

export interface CruxFacts {
  available: boolean;

  reason?: string;
  lcp_p75_ms?: number;
  inp_p75_ms?: number;
  cls_p75?: number;
}

export interface RobotsFacts {
  fetched: boolean;
  status: number | null;

  content: string | null;
  crawl_delay_s: number | null;
  sitemaps: string[];
}

export interface SiteEvidence {

  site_id: string;
  origin: string;
  entry_url: string;
  robots: RobotsFacts;

  https_redirect: boolean | null;
  security_headers: Record<string, string | null>;
  cookie_flags: { total: number; insecure: number; noHttpOnly: number; noSameSite: number };
  security_txt: boolean;
  sitemap_found: boolean;
  crux: CruxFacts;

  link_check: { checked: number; ok: number; broken: { url: string; status: number }[] };
}

export interface EvidenceBundle {

  bundle_id: string;
  schema: 'dxp.evidence/1';
  mode: ScanMode;
  version: EvidenceBundleVersion;
  collected_at: string;
  site: SiteEvidence;
  pages: PageEvidence[];

  skipped: { url: string; reason: string }[];
}

export type FindingState =
  | 'pass'
  | 'fail'
  | 'needs_review'
  | 'not_collected'
  | 'not_assessable';

export interface Finding {
  check_id: string;
  state: FindingState;

  value: number | string | null;

  coverage: number;

  detail: string;

  failing_urls?: string[];
}
