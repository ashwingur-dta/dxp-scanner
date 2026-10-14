import type { CheckDef } from '../types.js';
import { notAssessable } from '../types.js';
import { CRITERIA, type Criterion } from '../criteria.js';

const PROMPTS: Record<string, string> = {
  'DSS-1':
    'What user need and policy intent does this service address, and where is that recorded? Provide the proposal or business case section that defines the problem, the intended outcome and the benefits to be measured.',
  'DSS-2':
    'What user research has been conducted, with which user groups, and how did it change the design? Provide research reports, personas or journey maps, including research with people with disability and people with low digital ability.',
  'DSS-8':
    'Where new or emerging technology was adopted, what alternatives were considered and what evidence supported the choice? Provide the options analysis and the measures used to judge whether the innovation worked.',
  'DAS-4':
    'Which decision-making framework applied to this service (the myGov framework, or the framework for individuals not suitable for myGov, business and providers), and what was the outcome? Provide the completed assessment, including the cost-effectiveness reasoning and any barriers identified.',
  'DAS-5':
    'Which government delivery partners were engaged, when, and how is accountability defined? Provide memoranda of understanding, service level agreements or contracts, and evidence of engagement from the discovery stage onwards.',
  'DPS-5':
    'How is digital performance analysed and reported to the DTA at each Investment Oversight Framework state? Provide the reporting submitted through the Digital Capability Assessment Process and the Approved Programs Collection, and evidence of improvements made as a result.',
};

function buildCheck(c: Criterion): CheckDef {
  const key = `${c.standard}-${c.number}`;
  return {
    id: `${c.standard}-C${c.number}-NA`,
    standard: c.standard,
    criterion: c.number,
    sub_requirement: c.name,
    policy_quote:
      'Use the Digital Capability Assessment Process (DCAP) template to report on how you have met the criterion.',
    policy_url: c.url,
    method: 'attestation',
    requires: [],
    weight: 0,
    modes: ['quick', 'full'],
    attestation_prompt: PROMPTS[key] ?? '',
    run: () =>
      notAssessable(
        `${c.note} This criterion requires evidence held by the agency and is reported as not externally assessable rather than scored.`,
      ),
  };
}

export const notAssessableChecks: CheckDef[] = CRITERIA.filter(
  (c) => c.scorability === 'not_observable',
).map(buildCheck);
