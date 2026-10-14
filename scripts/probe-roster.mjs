const U = 'https://d3gzttk0pa47dz.cloudfront.net';
const HOSTS = {
  federal: ['www.abf.gov.au','www.abs.gov.au','www.aec.gov.au','asic.gov.au','www.austrade.gov.au',
    'business.gov.au','www.homeaffairs.gov.au','www.ipaustralia.gov.au','www.legislation.gov.au',
    'my.gov.au','www.oaic.gov.au','treasury.gov.au','www.apra.gov.au','www.rba.gov.au',
    'www.awm.gov.au','www.ga.gov.au','www.nla.gov.au','www.pmc.gov.au','www.apsc.gov.au',
    'www.arts.gov.au','www.finance.gov.au','www.naa.gov.au','www.studyassist.gov.au','www.tga.gov.au'],
  nsw: ['www.nsw.gov.au','www.service.nsw.gov.au','www.transport.nsw.gov.au','www.health.nsw.gov.au',
    'education.nsw.gov.au','www.planning.nsw.gov.au','www.revenue.nsw.gov.au','www.fairtrading.nsw.gov.au'],
  vic: ['www.vic.gov.au','service.vic.gov.au','www.health.vic.gov.au','www.education.vic.gov.au',
    'www.sro.vic.gov.au','transport.vic.gov.au','www.vicroads.vic.gov.au'],
  qld: ['www.qld.gov.au','www.health.qld.gov.au','www.tmr.qld.gov.au','education.qld.gov.au',
    'www.business.qld.gov.au','www.publications.qld.gov.au'],
  wa: ['www.wa.gov.au','www.health.wa.gov.au','www.transport.wa.gov.au','www.dmirs.wa.gov.au','www.water.wa.gov.au'],
  sa: ['www.sa.gov.au','www.health.sa.gov.au','www.education.sa.gov.au','www.revenuesa.sa.gov.au'],
  tas: ['www.tas.gov.au','www.health.tas.gov.au','www.education.tas.gov.au','www.transport.tas.gov.au'],
  act: ['www.act.gov.au','www.health.act.gov.au','www.education.act.gov.au','www.revenue.act.gov.au'],
  nt: ['nt.gov.au','health.nt.gov.au','education.nt.gov.au'],
  local: ['www.melbourne.vic.gov.au','www.cityofsydney.nsw.gov.au','www.brisbane.qld.gov.au','www.cityofperth.wa.gov.au'],
};

const all = Object.entries(HOSTS).flatMap(([j, hs]) => hs.map((h) => ({ j, h })));
const probe = async ({ j, h }) => {
  try {
    const r = await fetch(`${U}/api/reachable?url=${encodeURIComponent(h)}`, { signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    return { j, h, ok: d.reachable === true, why: d.reachable ? '' : (d.detail ?? d.message ?? d.error ?? '?') };
  } catch (e) {
    return { j, h, ok: false, why: 'probe error' };
  }
};

const out = [];
const CONC = 10;
for (let i = 0; i < all.length; i += CONC) out.push(...(await Promise.all(all.slice(i, i + CONC).map(probe))));

const short = (w) => /timeout|aborted/i.test(w) ? 'dropped' : w.replace(/^HTTP /, '');
for (const j of Object.keys(HOSTS)) {
  const rows = out.filter((r) => r.j === j);
  const ok = rows.filter((r) => r.ok);
  console.log(`\n${j.toUpperCase()}  ${ok.length}/${rows.length} reachable`);
  for (const r of rows) console.log(`  ${r.ok ? 'OK     ' : 'refused'} ${r.h.padEnd(32)} ${r.ok ? '' : short(r.why)}`);
}
const ok = out.filter((r) => r.ok);
console.log(`\nTOTAL ${ok.length}/${out.length} reachable from us-east-1`);
console.log('\nREACHABLE LIST:');
console.log(ok.map((r) => r.h).join(' '));
