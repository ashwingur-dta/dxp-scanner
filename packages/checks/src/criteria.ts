export type StandardId = 'DSS' | 'DIS' | 'DAS' | 'DPS';

export type Scorability =

  | 'automatable'

  | 'llm_judgeable'

  | 'partial'

  | 'not_observable';

export interface Standard {
  id: StandardId;
  name: string;
  url: string;

  existing_services_from: string | null;
}

export interface Criterion {
  standard: StandardId;
  number: number;
  name: string;
  url: string;
  scorability: Scorability;

  note: string;
}

const BASE = 'https://www.digital.gov.au/policy/digital-experience';

export const STANDARDS: Record<StandardId, Standard> = {
  DSS: {
    id: 'DSS',
    name: 'Digital Service Standard',
    url: `${BASE}/digital-service-standard`,
    existing_services_from: '2025-07-01',
  },
  DIS: {
    id: 'DIS',
    name: 'Digital Inclusion Standard',
    url: `${BASE}/digital-inclusion-standard`,
    existing_services_from: '2026-01-01',
  },
  DAS: {
    id: 'DAS',
    name: 'Digital Access Standard',
    url: `${BASE}/digital-access-standard`,
    existing_services_from: '2026-01-01',
  },
  DPS: {
    id: 'DPS',
    name: 'Digital Performance Standard',
    url: `${BASE}/digital-performance-standard`,

    existing_services_from: null,
  },
};

export const CRITERIA: Criterion[] = [

  {
    standard: 'DSS', number: 1, name: 'Have a clear intent',
    url: `${BASE}/digital-service-standard/criterion1`,
    scorability: 'not_observable',
    note: 'Intent, scope and benefits are defined in proposals and business cases before build. No public artefact.',
  },
  {
    standard: 'DSS', number: 2, name: 'Know your user',
    url: `${BASE}/digital-service-standard/criterion-2`,
    scorability: 'not_observable',
    note: 'User research, personas and journey maps are internal. A site cannot show whether research happened.',
  },
  {
    standard: 'DSS', number: 3, name: 'Leave no one behind',
    url: `${BASE}/digital-service-standard/criterion-3`,
    scorability: 'partial',
    note: 'Accessibility, plain language, alternate formats and assisted pathways are observable. Research with assistive-technology users is not.',
  },
  {
    standard: 'DSS', number: 4, name: 'Connect services',
    url: `${BASE}/digital-service-standard/criterion-4`,
    scorability: 'partial',
    note: 'Digital ID and myGov integration and published APIs are observable. Whether data reuse was assessed is not.',
  },
  {
    standard: 'DSS', number: 5, name: 'Build trust in design',
    url: `${BASE}/digital-service-standard/criterion-5`,
    scorability: 'partial',
    note: 'Transport security, privacy surfaces and vulnerability reporting are observable. ISM/Essential Eight posture is not.',
  },
  {
    standard: 'DSS', number: 6, name: "Don't reinvent the wheel",
    url: `${BASE}/digital-service-standard/criteron-6`,
    scorability: 'partial',
    note: 'Whether the site actually reuses common platforms and design systems is observable. The build-vs-reuse decision record is not.',
  },
  {
    standard: 'DSS', number: 7, name: 'Do no harm',
    url: `${BASE}/digital-service-standard/criterion-7`,
    scorability: 'partial',
    note: 'Stated privacy policy versus observed tracking is a genuine contradiction test. Whether a PIA was done is not observable.',
  },
  {
    standard: 'DSS', number: 8, name: 'Innovate with purpose',
    url: `${BASE}/digital-service-standard/criterion-8`,
    scorability: 'not_observable',
    note: 'Innovation governance and option appraisal are internal.',
  },
  {
    standard: 'DSS', number: 9, name: 'Monitor your service',
    url: `${BASE}/digital-service-standard/criterion-9`,
    scorability: 'partial',
    note: 'Delegates to the Digital Performance Standard. Instrumentation presence is observable; the agency\'s KPI set is not.',
  },
  {
    standard: 'DSS', number: 10, name: 'Keep it relevant',
    url: `${BASE}/digital-service-standard/criterion-10`,
    scorability: 'partial',
    note: 'Content freshness and broken links are observable. The review schedule and feedback log are not.',
  },

  {
    standard: 'DIS', number: 1, name: 'Embrace diversity',
    url: `${BASE}/digital-inclusion-standard/dis-criterion-1-embrace-diversity`,
    scorability: 'partial',
    note: 'Cohort-specific features are observable: in-language options on the front page, Auslan, audio formats, quick exit. Co-design is not.',
  },
  {
    standard: 'DIS', number: 2, name: 'Motivate digital use',
    url: `${BASE}/digital-inclusion-standard/dis-criterion-2-motivate-digital-use`,
    scorability: 'partial',
    note: 'Benefit messaging and help content are judgeable. The digital-uptake baseline is internal analytics.',
  },
  {
    standard: 'DIS', number: 3, name: 'Protect users',
    url: `${BASE}/digital-inclusion-standard/dis-criterion-3-protect-users`,
    scorability: 'partial',
    note: 'Privacy surfaces, consent behaviour, contact-channel variety and scam content are observable. Moderation practice is not.',
  },
  {
    standard: 'DIS', number: 4, name: 'Make it accessible',
    url: `${BASE}/digital-inclusion-standard/dis-criterion-4-make-it-accessible`,
    scorability: 'partial',
    note: 'The largest observable surface in the policy. Procurement clauses, staff training and testing with real users are not observable.',
  },
  {
    standard: 'DIS', number: 5, name: 'Provide flexibility and choice',
    url: `${BASE}/digital-inclusion-standard/dis-criterion-5-provide-flexibility-and-choice`,
    scorability: 'partial',
    note: 'Responsive behaviour, theming, time limits and save-and-resume are observable. Cross-channel data synchronisation is not.',
  },

  {
    standard: 'DAS', number: 1, name: 'Understand how your users access services',
    url: `${BASE}/digital-access-standard/das%20criterion%201`,
    scorability: 'partial',
    note: 'Which access point the service sits on, and its discoverability, are observable. The user research behind that choice is not.',
  },
  {
    standard: 'DAS', number: 2, name: 'Define your service offering',
    url: `${BASE}/digital-access-standard/das-criterion-2`,
    scorability: 'partial',
    note: 'The realised capability set is observable. The reuse roadmap and scalability case are not.',
  },
  {
    standard: 'DAS', number: 3, name: 'Use the AGA to find reusable platforms and capabilities',
    url: `${BASE}/digital-access-standard/das-criterion-3`,
    scorability: 'partial',
    note: 'Reuse of whole-of-government platforms is strongly detectable. Whether the AGA was consulted is not.',
  },
  {
    standard: 'DAS', number: 4, name: 'Follow the decision-making framework',
    url: `${BASE}/digital-access-standard/das-criterion-4`,
    scorability: 'not_observable',
    note: 'A purely internal decision procedure. Note that absence from myGov is explicitly permitted by the policy, so it is not a non-compliance signal.',
  },
  {
    standard: 'DAS', number: 5, name: 'Engage with delivery partners',
    url: `${BASE}/digital-access-standard/das-criterion5`,
    scorability: 'not_observable',
    note: 'Memoranda of understanding, service level agreements and engagement timing are internal governance artefacts.',
  },

  {
    standard: 'DPS', number: 1, name: 'Implement a monitoring framework',
    url: `${BASE}/digital-performance-standard/dps-criterion-1-implement-monitoring-framework`,
    scorability: 'partial',
    note: 'Deployed analytics tooling is observable. The framework document, KPI selection and baselines are not.',
  },
  {
    standard: 'DPS', number: 2, name: 'Measure the availability of your digital service',
    url: `${BASE}/digital-performance-standard/dps-criterion-2-measure-availability-your-digital-service`,
    scorability: 'automatable',
    note: 'The policy names uptime, error rate, load time, fully loaded time and percentage of valid links, and explicitly endorses outside-in measurement.',
  },
  {
    standard: 'DPS', number: 3, name: 'Measure the success of your digital service',
    url: `${BASE}/digital-performance-standard/dps-criterion-3-measure-success-your-digital-service`,
    scorability: 'partial',
    note: 'Instrumentation and end-to-end online completability are observable. Completion and abandonment rates are internal.',
  },
  {
    standard: 'DPS', number: 4, name: 'Measure if your digital service is meeting customer needs',
    url: `${BASE}/digital-performance-standard/dps-criterion-4-measure-if-your-digital-service-meeting-customer-needs`,
    scorability: 'automatable',
    note: 'The policy requires a feedback channel on each page and at the end of a transaction. That is a per-page presence check.',
  },
  {
    standard: 'DPS', number: 5, name: 'Analyse and report your digital performance',
    url: `${BASE}/digital-performance-standard/dps-criterion-5-analyse-and-report-your-digital-performance`,
    scorability: 'not_observable',
    note: 'Reporting flows to the DTA through the Investment Oversight Framework. Public publication is voluntary, so its absence is not a failure.',
  },
];

export function criterionKey(standard: StandardId, number: number): string {
  return `${standard}-C${number}`;
}

export function getCriterion(standard: StandardId, number: number): Criterion {
  const found = CRITERIA.find((c) => c.standard === standard && c.number === number);
  if (!found) throw new Error(`Unknown criterion ${standard}-C${number}`);
  return found;
}
