// Service jobs and certificates: fire risk assessment, fire alarm, emergency lighting, extinguishers and PAT.
// One engine: visit details → checklist → item register → readings → findings → outcome → certify → certificate PDF.
// Issuing files the certificate in the site's Compliance centre and turns every finding into an action for the site.
// The wording is Safetybiz's own; each form collects the information the relevant standard asks for.
import { sb, D, $, esc, uid, today, addDays, fd, ft, toast, openModal, closeModal, confirmBox, rows, byId, ins, upd, del, fetchAll, signaturePad, ICON } from './core.js';
import { LOGO } from './pdf.js';

ICON.svc = '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>';
export const SB_CONTACT = 'Linton Avenue, Quedgeley, GL2 2HR · 01452 452309 · www.safetybiz.co.uk';
const S = { f: '', urls: {} };
const PFN = ['Pass', 'Fail', 'N/A', 'Limitation'], YNN = ['Yes', 'No', 'N/A'];
const SEVS = ['Low', 'Medium', 'High'];
const sevsOf = (j) => F(j).sevs || SEVS, defSev = (j) => F(j).defSev || 'Medium';
const sevHi = (v) => v === 'High' || v === 'Substantial' || v === 'Intolerable', sevMid = (v) => v === 'Medium' || v === 'Moderate';
const PRIO = { Low: 'Low', Medium: 'Medium', High: 'High', Tolerable: 'Low', Moderate: 'Medium', Substantial: 'High', Intolerable: 'Urgent' };
const TS = { Immediate: 1, 'Short term (1 month)': 30, 'Medium term (3 months)': 90, 'Long term (6 months)': 180 };
const o = (...a) => a;

// ---------- the five forms ----------
export const FORMS = {
  fra: {
    name: 'Fire risk assessment', title: 'Fire Risk Assessment', short: 'Fire risk assessment', color: '#153F43', accent: '#FA4616', doc: /fire risk/i,
    std: 'Regulatory Reform (Fire Safety) Order 2005', stdLong: 'the Regulatory Reform (Fire Safety) Order 2005, following a structured method in line with PAS 79-1',
    ans: YNN, bad: 'No', months: [6, 12, 24], defMonths: 12, approver: 'Validated by',
    sevs: ['Tolerable', 'Moderate', 'Substantial', 'Intolerable'], defSev: 'Moderate',
    visitTypes: ['New assessment', 'Review of previous assessment'],
    fields: [
      { k: 'rp', l: 'Responsible person' }, { k: 'managed', l: 'Fire safety day to day is managed by' }, { k: 'prev', l: 'Previous assessment (date / reference)' },
      { k: 'use', l: 'Occupancy type', o: o('Restaurant / takeaway', 'Pub / bar', 'Shop', 'Office', 'Hotel / guest house', 'Care home', 'Warehouse / industrial', 'School / nursery', 'Other') },
      { k: 'general', l: 'General description of the premises', t: 'area' }, { k: 'construction', l: 'Construction', t: 'area' },
      { k: 'compart', l: 'Compartmentation', t: 'area' }, { k: 'escape', l: 'Means of escape', t: 'area' },
      { k: 'floors', l: 'Floors at or above ground' }, { k: 'basement', l: 'Floors below ground' }, { k: 'stairs', l: 'Number of stairways' },
      { k: 'exits', l: 'Number of final exits' }, { k: 'lifts', l: 'Lifts present', o: o('No', 'Yes') }, { k: 'footprint', l: 'Approximate footprint (m2)' },
      { k: 'staff', l: 'Maximum employees at any one time' }, { k: 'others', l: 'Maximum other occupants at any one time' },
      { k: 'sleeping', l: 'Sleeping occupants', o: o('No', 'Yes') }, { k: 'disabled', l: 'Disabled employees or occupants', o: o('No', 'Yes') },
      { k: 'lone', l: 'Lone workers or people in remote areas', o: o('No', 'Yes') }, { k: 'young', l: 'Young persons employed', o: o('No', 'Yes') },
      { k: 'alarm', l: 'Fire alarm and detection in place' }, { k: 'el', l: 'Emergency lighting in place' }, { k: 'ext', l: 'Types of portable extinguishers' },
      { k: 'fixed', l: 'Sprinklers or other fixed systems' }, { k: 'policy', l: 'Evacuation policy', o: o('Simultaneous evacuation', 'Phased evacuation', 'Stay put', 'Progressive horizontal evacuation') },
      { k: 'loss', l: 'Recent fires or false alarms', t: 'area' }, { k: 'security', l: 'Security measures', t: 'area' }, { k: 'authority', l: 'Enforcing authority (fire and rescue service)' },
    ],
    groups: [
      { t: '1.1 Electrical sources of ignition', items: [['1.1a', 'The fixed electrical installation has been inspected and tested at suitable intervals (EICR)'], ['1.1b', 'Portable electrical equipment is controlled and tested'], ['1.1c', 'Trailing leads and adaptors are kept to a minimum'], ['1.1d', 'Electric vehicle charge points are suitably sited (where present)'], ['1.1e', 'Charging and storage of e-bikes and e-scooters is controlled']] },
      { t: '1.2 Smoking', items: [['1.2a', 'Reasonable measures are taken to prevent fires from smoking, with no-smoking signs displayed']] },
      { t: '1.3 Arson', items: [['1.3a', 'Basic security against arson by outsiders is reasonable'], ['1.3b', 'There is no unnecessary fire load close to the building (bins, pallets, waste)']] },
      { t: '1.4 Portable heaters and heating installations', items: [['1.4a', 'The use of portable heaters is controlled'], ['1.4b', 'Fixed heating and ventilation installations are maintained']] },
      { t: '1.5 Cooking', items: [['1.5a', 'Reasonable measures are taken to prevent fires from cooking (thermostats and cut-outs on fryers)'], ['1.5b', 'Cooker hood filters are cleaned or changed and extract ductwork is professionally cleaned regularly']] },
      { t: '1.6 Lightning', items: [['1.6a', 'Lightning protection is provided where the building needs it']] },
      { t: '1.7 Housekeeping', items: [['1.7a', 'The overall standard of housekeeping is adequate'], ['1.7b', 'Combustible materials are kept apart from ignition sources'], ['1.7c', 'Combustible materials and waste are not allowed to build up or be stored unsuitably']] },
      { t: '1.8 Contractors and building works', items: [['1.8a', 'Fire safety conditions are placed on outside contractors'], ['1.8b', 'A permit-to-work system is used for hot work'], ['1.8c', 'In-house maintenance staff take suitable precautions']] },
      { t: '1.9 Dangerous substances', items: [['1.9a', 'Precautions are adequate for any dangerous substances'], ['1.9b', 'Flammable liquids, gases and oxidising agents are stored with adequate ventilation and in minimum quantities'], ['1.9c', 'Furniture and furnishings meet the relevant fire standards']] },
      { t: '2.11 Means of escape', items: [['2.11a', 'There are enough escape routes for the maximum number of people'], ['2.11b', 'Stairs and exits are wide enough for the number of people'], ['2.11c', 'Travel distances are reasonable'], ['2.11d', 'Fire exits open in the direction of escape where necessary'], ['2.11e', 'Escape routes are suitably protected'], ['2.11f', 'There are reasonable arrangements for disabled and vulnerable people to escape'], ['2.11g', 'Fire doors are in sound condition and self-closing where needed'], ['2.11h', 'All escape routes are clear of obstructions'], ['2.11i', 'All fire exits open easily and immediately']] },
      { t: '2.12 Limiting fire spread', items: [['2.12a', 'Compartmentation is of a reasonable standard'], ['2.12b', 'Internal and external linings do not promote fire spread'], ['2.12c', 'Fire separation within any roof space is reasonable']] },
      { t: '2.13 Emergency escape lighting', items: [['2.13a', 'A reasonable standard of emergency escape lighting is provided']] },
      { t: '2.14 Fire safety signs and notices', items: [['2.14a', 'A reasonable standard of fire safety signs and notices is provided']] },
      { t: '2.15 Means of giving warning', items: [['2.15a', 'A suitable fire detection and alarm system is provided'], ['2.15b', 'Alarm signals are sent to a monitoring centre where this is needed'], ['2.15c', 'The alarm panel is accessible, free of faults, with a zone plan displayed']] },
      { t: '2.16 Firefighting equipment', items: [['2.16a', 'Reasonable provision of portable extinguishers and fire blankets (including wet chemical by fryers)']] },
      { t: '3.20 Procedures and arrangements', items: [['3.20a', 'Suitable records of the fire safety arrangements are kept'], ['3.20b', 'There are arrangements to check the premises have been evacuated'], ['3.20c', 'Personal emergency evacuation plans (PEEPs) are in place where needed'], ['3.20d', 'People are nominated to use firefighting equipment'], ['3.20e', 'People are nominated to help evacuate, including disabled people'], ['3.20f', 'In shared buildings, the duty holders co-operate on fire safety'], ['3.20g', 'Routine in-house checks of fire precautions are carried out']] },
      { t: '3.21 Training and drills', items: [['3.21a', 'All staff receive adequate fire safety instruction and training'], ['3.21b', 'Fire drills are carried out at suitable intervals and recorded'], ['3.21c', 'Contractors working on site are told about fire risks and procedures']] },
      { t: '3.22 Testing and maintenance', items: [['3.22a', 'The fire alarm is tested weekly and serviced periodically'], ['3.22b', 'Emergency lighting is tested monthly and annually'], ['3.22c', 'Final exit doors and security fastenings are checked routinely'], ['3.22d', 'Fire extinguishers are serviced annually']] },
    ],
    risk: true,
  },
  fa: {
    subject: 'fire detection and fire alarm system', name: 'Fire alarm inspection and servicing', title: 'Fire Alarm Inspection and Servicing Certificate', short: 'Fire alarm', color: '#D7261E', doc: /fire alarm/i,
    std: 'BS 5839-1:2025', stdLong: 'the inspection and servicing recommendations of BS 5839-1:2025',
    ans: PFN, bad: 'Fail', months: [3, 6], defMonths: 6,
    visitTypes: ['Six-monthly service', 'Annual service (includes 12-month tasks)', 'Call-out'],
    fields: [
      { k: 'category', l: 'System category', o: o('L1', 'L2', 'L3', 'L4', 'L5', 'M', 'P1', 'P2', 'Not known') },
      { k: 'panel', l: 'Control panel (make and model)' },
      { k: 'zones', l: 'Number of zones' },
      { k: 'detectors', l: 'Number of automatic detectors' },
      { k: 'arc', l: 'Connected to an alarm receiving centre', o: o('No', 'Yes') },
      { k: 'desc', l: 'Description and extent of the system', t: 'area' },
      { k: 'limits', l: 'Agreed limitations of this visit', t: 'area' },
    ],
    groups: [
      { t: 'Every service visit', items: [
        ['1', 'Logbook checked; recorded faults have been dealt with'], ['2', 'False alarm records reviewed and suitable action taken'],
        ['3', 'Manual call points are unobstructed, visible and present at every exit'], ['4', 'Detectors are unobstructed: no new partitions, storage or fittings too close'],
        ['5', 'No change in use or layout that makes the detection unsuitable'], ['6', 'Battery charge voltage is within the manufacturer\'s range'],
        ['7', 'Batteries load-tested with the mains disconnected and in good condition'], ['8', 'Panel fire functions tested by operating a device on every zone'],
        ['9', 'Sounders and visual alarm devices operate and are not obstructed'], ['10', 'Panel controls and indicators operate correctly'],
        ['11', 'Fault warnings tested (simulated where practicable)'], ['12', 'Signals to the alarm receiving centre tested on every path (where connected)'],
        ['13', 'Ancillary functions (door releases, plant shutdown) operate correctly'], ['14', 'Radio devices serviced and signal strengths adequate (where fitted)'],
        ['15', 'Accessible cable fixings are secure and undamaged'], ['16', 'Cause and effect confirmed by operating at least one input'],
        ['17', 'Further checks recommended by the manufacturer carried out'], ['18', 'Defects reported to the responsible person and logbook completed']] },
      { t: '12-month tasks', when: (j) => /Annual/.test(j.data.visit_type || ''), items: [
        ['19', 'Every manual call point tested'], ['20', 'Every automatic detector functionally tested with a suitable test stimulus'],
        ['21', 'Detectors examined for damage, paint or contamination'], ['22', 'Analogue values within the manufacturer\'s range (where available)'],
        ['23', 'Standby battery capacity still suitable'], ['24', 'Zone plan displayed at the panel and matching the panel\'s zone indication'],
        ['25', 'The system category is still appropriate for the premises']] },
    ],
    register: { t: 'Devices tested (optional)', cols: [{ k: 'zone', l: 'Zone', w: 70 }, { k: 'type', l: 'Device', o: o('Call point', 'Smoke detector', 'Heat detector', 'Multi-sensor', 'Sounder', 'Visual alarm', 'Beam detector', 'Other') }, { k: 'loc', l: 'Location' }, { k: 'res', l: 'Result', o: o('Pass', 'Fail') }, { k: 'note', l: 'Note' }],
      fail: (r) => r.res === 'Fail', label: (r) => `${r.type || 'Device'}${r.loc ? ' – ' + r.loc : ''}${r.zone ? ' (zone ' + r.zone + ')' : ''} failed${r.note ? ': ' + r.note : ''}` },
    readings: [{ k: 'batt', l: 'Batteries (size, date, condition)' }, { k: 'vcharge', l: 'Charge voltage (V)' }, { k: 'vload', l: 'Voltage under load (V)' }, { k: 'false', l: 'False alarms in the last 12 months' }],
  },
  el: {
    subject: 'emergency lighting installation', name: 'Emergency lighting inspection and testing', title: 'Emergency Lighting Inspection and Test Certificate', short: 'Emergency lighting', color: '#1E9E5A', doc: /emergency light/i,
    std: 'BS 5266-1:2025', stdLong: 'the recommendations of BS 5266-1:2025, BS EN 50172:2024 and BS EN 1838:2024',
    ans: PFN, bad: 'Fail', months: [1, 6, 12], defMonths: 12,
    visitTypes: ['Annual full-duration test', 'Monthly functional test', 'Five-yearly verification'],
    fields: [
      { k: 'arr', l: 'System type', o: o('Self-contained luminaires', 'Central battery', 'Self-contained and central battery', 'Standby generator') },
      { k: 'purpose', l: 'Purpose', o: o('Emergency escape lighting', 'Escape and standby lighting', 'Escape and high-risk task lighting') },
      { k: 'duration', l: 'Rated duration', o: o('3 hours', '1 hour', 'Other') },
      { k: 'ats', l: 'Automatic test system fitted', o: o('No', 'Yes') },
      { k: 'desc', l: 'Description and extent of the installation', t: 'area' },
      { k: 'eicr', l: 'Most recent EICR (reference and date)' },
    ],
    groups: [
      { t: 'Functional test', items: [['1', 'Every luminaire and illuminated sign switched to emergency mode by simulating a mains failure'], ['2', 'All luminaires and signs present, clean and working'], ['3', 'Mains restored and charging indicators checked afterwards'], ['4', 'Automatic test or central battery indicators checked (where fitted)'], ['5', 'Results recorded in the logbook']] },
      { t: 'Annual full-duration test', when: (j) => !/Monthly/.test(j.data.visit_type || ''), items: [['6', 'Every luminaire tested for its full rated duration'], ['7', 'Luminaires and signs inspected for position, damage and dirt'], ['8', 'Indicators checked after the full-duration test'], ['9', 'Safety signs clearly visible and not obstructed'], ['10', 'Tested at a low-risk time, or alternate luminaires tested, so cover is kept while batteries recharge']] },
      { t: 'Five-yearly verification', when: (j) => /Five/.test(j.data.visit_type || ''), items: [['11', 'Light levels verified against the original design (photometric check)']] },
    ],
    register: { t: 'Luminaires and signs', cols: [{ k: 'no', l: 'No.', w: 60 }, { k: 'loc', l: 'Location' }, { k: 'type', l: 'Type', o: o('Bulkhead', 'Twinspot', 'Exit sign', 'Downlight', 'Recessed', 'Other') }, { k: 'mode', l: 'Mode', o: o('Non-maintained', 'Maintained') }, { k: 'res', l: 'Result', o: o('Pass', 'Failed duration test', 'Not working', 'Damaged / missing') }, { k: 'note', l: 'Note' }],
      fail: (r) => r.res && r.res !== 'Pass', label: (r) => `Emergency light ${r.no ? '#' + r.no + ' ' : ''}${r.type ? r.type.toLowerCase() + ' ' : ''}${r.loc ? '– ' + r.loc + ' ' : ''}– ${(r.res || '').toLowerCase()}${r.note ? ': ' + r.note : ''}` },
    readings: [{ k: 'meter', l: 'Light meter (model and serial), if used' }],
  },
  ext: {
    subject: 'portable fire extinguishers and fire blankets', name: 'Fire extinguisher service', title: 'Fire Extinguisher Service Certificate', short: 'Fire extinguishers', color: '#8B1E3F', doc: /extinguisher/i,
    std: 'BS 5306-3', stdLong: 'the maintenance recommendations of BS 5306-3, with siting checked against BS 5306-8',
    ans: PFN, bad: 'Fail', months: [12], defMonths: 12,
    visitTypes: ['Annual maintenance', 'Commissioning', 'Supply', 'Call-out'],
    fields: [{ k: 'notes', l: 'Notes about the premises', t: 'area' }],
    groups: [{ t: 'Provision and siting', items: [['1', 'Extinguishers suit the fire risks (e.g. wet chemical by fryers, CO2 for electrical)'], ['2', 'Mounted on brackets or stands, at a suitable height, near exits and hazards'], ['3', 'Each extinguisher has an identification sign'], ['4', 'Access to every extinguisher is clear'], ['5', 'Safety pins, tamper seals and gauges are in order'], ['6', 'Fire blankets are provided where needed and in good condition'], ['7', 'Staff carry out monthly visual checks']] }],
    register: { t: 'Extinguishers', cols: [{ k: 'loc', l: 'Location' }, { k: 'type', l: 'Type', o: o('Water', 'Foam', 'Powder', 'CO2', 'Wet chemical', 'Water mist', 'Fire blanket') }, { k: 'size', l: 'Size', w: 70 }, { k: 'year', l: 'Year made', w: 70 }, { k: 'work', l: 'Work done', o: o('Basic service', 'Extended service', 'Overhaul', 'Commissioned', 'Recharged', 'Replaced', 'Condemned') }, { k: 'res', l: 'Result', o: o('Serviceable', 'Action required', 'Condemned') }, { k: 'note', l: 'Note' }],
      fail: (r) => r.res && r.res !== 'Serviceable', label: (r) => `${r.type || 'Extinguisher'}${r.size ? ' ' + r.size : ''}${r.loc ? ' – ' + r.loc : ''}: ${(r.res || '').toLowerCase()}${r.note ? ' – ' + r.note : ''}` },
  },
  pat: {
    subject: 'portable electrical equipment listed', name: 'Portable appliance inspection and testing', title: 'Portable Appliance Inspection and Test Certificate', short: 'PAT testing', color: '#1F6FB2', doc: /portable appliance|\bPAT\b/i,
    std: 'IET Code of Practice', stdLong: 'the IET Code of Practice for In-service Inspection and Testing of Electrical Equipment, supporting the Electricity at Work Regulations 1989',
    ans: PFN, bad: 'Fail', months: [6, 12, 24], defMonths: 12,
    visitTypes: ['Routine inspection and test', 'Initial test'],
    fields: [{ k: 'instr', l: 'Test instrument (make and model)' }, { k: 'serial', l: 'Instrument serial number' }, { k: 'cal', l: 'Instrument calibration date', t: 'date' }],
    groups: [{ t: 'General', items: [['1', 'An equipment register is kept and up to date'], ['2', 'All equipment found in use was included'], ['3', 'Failed items labelled and taken out of use'], ['4', 'Passed items labelled with the next test date']] }],
    quick: true,
    register: { t: 'Equipment tested', cols: [{ k: 'desc', l: 'Equipment' }, { k: 'cls', l: 'Class', o: o('Class I', 'Class II', 'Lead') }, { k: 'res', l: 'Result', o: o('Pass', 'Fail') }],
      fail: (r) => r.res === 'Fail', label: (r) => `${r.desc || 'Equipment'} failed the PAT test – take out of use and repair or replace` },
  },
};
// Risk rating for each fire risk assessment action (our wording of the usual four levels).
export const RATE = {
  Tolerable: { c: '#43B9A5', ts: 'Long term (6 months)', d: 'Low risk, but action is needed to protect the property and keep the business running' },
  Moderate: { c: '#F5B800', t: '#10292b', ts: 'Medium term (3 months)', d: 'Low risk to life; needs planned action over the longer term' },
  Substantial: { c: '#FF8A1F', ts: 'Short term (1 month)', d: 'Act as soon as possible; where suitable, it may go into upcoming planned work' },
  Intolerable: { c: '#D7261E', ts: 'Immediate', d: 'Interim measures needed straight away to keep people safe until a permanent fix is in place' },
};
const RISK_L = ['Low', 'Medium', 'High'], RISK_S = ['Slight harm', 'Moderate harm', 'Extreme harm'];
const RISK_M = [['Trivial', 'Tolerable', 'Moderate'], ['Tolerable', 'Moderate', 'Substantial'], ['Moderate', 'Substantial', 'Intolerable']];
const riskOf = (d) => { const l = RISK_L.indexOf(d.rl), s = RISK_S.indexOf(d.rs); return l < 0 || s < 0 ? '' : RISK_M[l][s]; };

// ---------- helpers ----------
const F = (j) => FORMS[j.type];
const cName = (id) => byId('clients', id)?.name || '';
const site = (j) => byId('sites', j.site_id) || {};
const groupsOf = (j) => F(j).groups.filter((g) => !g.when || g.when(j));
const itemsOf = (j) => groupsOf(j).flatMap((g) => g.items);
const groupOf = (j, k) => F(j).groups.find((g) => g.items.some(([x]) => x === k))?.t || '';
const qOf = (j, k) => (itemsOf(j).find(([x]) => x === k) || [])[1] || '';
const photosOf = (o) => (o ? (o.photos || []).concat(o.photo ? [o.photo] : []) : []);
const isFra = (j) => j.type === 'fra';
const fxTitle = (j, x) => (isFra(j) && x.src.startsWith('q:') ? `${x.q}${x.text ? ' — ' + x.text : ''}` : x.text);
const tag = (j) => `<span class="svt" style="background:${F(j).color}">${esc(F(j).short)}</span>`;
const statusTag = (j) => (j.status === 'Issued' ? '<span class="tag ok">Issued</span>' : '<span class="tag warn">Draft</span>');
const nextDue = (j) => addMonths(j.visit_date || today(), j.interval_months || F(j).defMonths);
const addMonths = (d, m) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
const newCertNo = (t) => `SB-${t.toUpperCase()}-${today().replace(/-/g, '').slice(2)}-${uid().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
const blankData = (t) => ({ visit_type: FORMS[t].visitTypes[0], f: {}, ans: {}, reg: [], r: {}, fx: [], summary: '' });
function missing(j) {
  const d = j.data, a = itemsOf(j).filter(([k]) => !(d.ans[k] && d.ans[k].a)).length;
  const nc = isFra(j) ? itemsOf(j).filter(([k]) => d.ans[k]?.a === 'No' && !(d.ans[k].c || '').trim()).length : 0;
  return { answers: a, nc, outcome: !j.outcome, risk: F(j).risk && !riskOf(d) };
}
// Findings: failed checklist items and failed register rows add a finding automatically; the engineer can add more.
function syncFindings(j) {
  const d = j.data, f = F(j), keep = new Set();
  itemsOf(j).forEach(([k, q]) => { if (d.ans[k]?.a === f.bad) { keep.add('q:' + k); if (!d.fx.some((x) => x.src === 'q:' + k)) d.fx.push(isFra(j)
    ? { id: uid(), src: 'q:' + k, q, cat: groupOf(j, k), text: d.ans[k].c || '', sev: defSev(j), ts: RATE[defSev(j)].ts }
    : { id: uid(), src: 'q:' + k, text: q + (d.ans[k].c ? ' — ' + d.ans[k].c : ''), sev: defSev(j), ts: 'Short term (1 month)' }); } });
  if (f.register) d.reg.forEach((r) => { if (f.register.fail(r)) { keep.add('r:' + r.id); if (!d.fx.some((x) => x.src === 'r:' + r.id)) d.fx.push({ id: uid(), src: 'r:' + r.id, text: f.register.label(r), sev: defSev(j), ts: 'Short term (1 month)' }); } });
  d.fx = d.fx.filter((x) => x.src.startsWith('m:') || keep.has(x.src) || x.edited);
}
const save = (j, wait = 700) => upd('service_jobs', j.id, { data: j.data }, wait).catch(() => {});

// ---------- views ----------
export function svList(clientFilter) {
  const q = S.f.toLowerCase();
  const list = rows('service_jobs').filter((j) => (!clientFilter || j.client_id === clientFilter) && (!q || [j.cert_no, F(j).short, cName(j.client_id), site(j).name].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (a.status === 'Draft' ? 0 : 1) - (b.status === 'Draft' ? 0 : 1) || (b.visit_date || '').localeCompare(a.visit_date || ''));
  const soon = addDays(today(), 60), due = rows('service_jobs').filter((j) => j.status === 'Issued' && j.next_due && j.next_due <= soon && !rows('service_jobs').some((x) => x.site_id === j.site_id && x.type === j.type && x.visit_date > j.visit_date));
  return `<div class="page"><div class="sect"><div><h2>Service jobs</h2><p class="hint">Fire risk assessments, fire alarm, emergency lighting, extinguisher and PAT certificates. Issuing a certificate files it in the site's Compliance centre and raises an action for every defect.</p></div><button class="btn pri" data-act="svNew">+ New service job</button></div>
  ${due.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="font-size:16px;margin-bottom:8px">Due in the next 60 days — rebook</h3>${due.sort((a, b) => a.next_due.localeCompare(b.next_due)).map((j) => `<div class="li">${tag(j)}<span style="flex:1"><b>${esc(site(j).name)}</b> · ${esc(cName(j.client_id))}<br><span class="muted">${j.next_due < today() ? 'Was due' : 'Due'} ${fd(j.next_due)} · last certificate ${esc(j.cert_no)}</span></span><button class="btn sm" data-act="svNew" data-s="${j.site_id}" data-t="${j.type}">Start next visit</button></div>`).join('')}</div>` : ''}
  <div class="row" style="margin-bottom:10px"><input id="sv-q" type="search" data-ui="svq" value="${esc(S.f)}" placeholder="Search by certificate, site or client…" style="max-width:340px"></div>
  ${list.length ? `<div class="tw"><table class="stack"><thead><tr><th>Service</th><th>Certificate</th><th>Client · site</th><th>Visit</th><th>Outcome</th><th>Next due</th><th>Status</th></tr></thead><tbody>${list.map((j) => `<tr class="click" data-go="service/${j.id}"><td data-l="Service">${tag(j)}</td><td data-l="Certificate"><b>${esc(j.cert_no)}</b></td><td data-l="Client · site">${esc(cName(j.client_id))}<br><span class="muted">${esc(site(j).name)}</span></td><td data-l="Visit">${fd(j.visit_date)}</td><td data-l="Outcome">${j.outcome ? `<span class="tag ${j.outcome === 'Satisfactory' ? 'ok' : 'bad'}">${j.outcome}</span>` : '—'}</td><td data-l="Next due">${j.status === 'Issued' ? fd(j.next_due) : '—'}</td><td data-l="Status">${statusTag(j)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty"><h3>No service jobs yet</h3><p class="muted">Start one for any client site.</p><button class="btn pri" data-act="svNew">+ New service job</button></div>`}</div>`;
}
export const setSvQuery = (v) => (S.f = v);

function cell(j, path, v, opts, ro, extra = '') {
  const id = 'sj-' + j.id.slice(0, 8) + '-' + path.replace(/[^a-z0-9]/gi, '-');
  if (ro) return `<span>${esc(v || '—')}</span>`;
  if (opts) return `<select id="${id}" data-sj="${j.id}|${path}"${extra}><option value=""></option>${opts.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  return `<input id="${id}" data-sj="${j.id}|${path}" value="${esc(v)}"${extra}>`;
}
function fieldBlock(j, fd0, ro) {
  const v = j.data.f[fd0.k] || '', id = 'sj-' + j.id.slice(0, 8) + '-f-' + fd0.k;
  if (ro) return `<div${fd0.t === 'area' ? ' class="full"' : ''}><span class="muted">${esc(fd0.l)}</span><br>${esc(v || '—')}</div>`;
  if (fd0.t === 'area') return `<label class="full">${esc(fd0.l)}<textarea id="${id}" data-sj="${j.id}|f.${fd0.k}" style="min-height:60px">${esc(v)}</textarea></label>`;
  if (fd0.o) return `<label>${esc(fd0.l)}<select id="${id}" data-sj="${j.id}|f.${fd0.k}"><option value=""></option>${fd0.o.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
  return `<label>${esc(fd0.l)}<input id="${id}" type="${fd0.t || 'text'}" data-sj="${j.id}|f.${fd0.k}" value="${esc(v)}"></label>`;
}

export function svView(id) {
  const j = byId('service_jobs', id); if (!j) return '<div class="page"><div class="empty"><h3>Service job not found</h3></div></div>';
  const f = F(j), d = j.data, ro = j.status === 'Issued', st = site(j), m = missing(j);
  photoUrls(j);
  const ansBtns = (k) => f.ans.map((v) => `<button class="${d.ans[k]?.a === v ? 'on' + (v === f.bad ? ' bad' : '') : ''}" data-act="svAns" data-id="${j.id}" data-k="${k}" data-v="${v}"${ro ? ' disabled' : ''}>${v}</button>`).join('');
  const sid = (x) => `sj-${j.id.slice(0, 8)}-${String(x).replace(/[^a-z0-9]/gi, '-')}`;
  const thumbs = (paths, kind, key) => paths.length || !ro ? `<div class="svphs">${paths.map((ph) => `<span class="svpw"><img src="${esc(S.urls[ph] || '')}" alt="Photo">${ro ? '' : `<button class="svpx" data-act="svPhDel" data-id="${j.id}" data-kind="${kind}" data-k="${key}" data-p="${esc(ph)}" aria-label="Remove photo">✕</button>`}</span>`).join('')}
    ${ro ? '' : `<label class="btn sm svpadd">+ Photo<input type="file" accept="image/*" multiple data-sj="${j.id}|${kind}.${key}.photos" style="display:none"></label>`}</div>` : '';
  const rateBtns = (x) => Object.keys(RATE).map((r) => `<button class="rate${x.sev === r ? ' on' : ''}" style="--rc:${RATE[r].c};--rt:${RATE[r].t || '#fff'}" data-act="svSev" data-id="${j.id}" data-x="${x.id}" data-v="${r}"${ro ? ' disabled' : ''}>${r}</button>`).join('');
  const qBlock = (k, q) => { const an = d.ans[k] || {}, x = an.a === f.bad ? d.fx.find((y) => y.src === 'q:' + k) : null;
    const ph = isFra(j) ? (an.a === 'No' ? 'Non-conformance: what is wrong, and what must be done' : an.a === 'Yes' ? 'Control in place: what you saw (optional)' : 'Comment (optional)') : 'Comment (optional)';
    return `<div class="aq${x ? ' aqno' : ''}"><span><b>${esc(k)}.</b> ${esc(q)}</span><div class="seg">${ansBtns(k)}</div>
    ${x && isFra(j) ? `<div class="nt rates"><span class="muted" style="font-size:12.5px">Risk rating</span>${rateBtns(x)}${ro ? `<span class="muted">· ${esc(x.ts)}</span>` : cell(j, `fx.${x.id}.ts`, x.ts, Object.keys(TS), false, ' aria-label="Timescale" style="width:200px"')}</div>` : ''}
    ${ro ? (an.c ? `<div class="nt">${esc(an.c)}</div>` : '') : `<div class="nt"><textarea id="${sid('c' + k)}" data-sj="${j.id}|ans.${k}.c" rows="${isFra(j) && an.a ? 2 : 1}" placeholder="${ph}">${esc(an.c || '')}</textarea></div>`}
    <div class="nt">${thumbs(photosOf(an), 'ans', k)}</div></div>`; };
  const groups = groupsOf(j).map((g) => `<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">${esc(g.t)}</h3>${g.items.map(([k, q]) => qBlock(k, q)).join('')}</div>`).join('');
  const qcls = S.qcls || 'Class I', pass = d.reg.filter((r) => r.res === 'Pass').length, failN = d.reg.filter((r) => r.res === 'Fail').length;
  const quick = f.quick && !ro ? `<div class="pq"><input id="pq-name" placeholder="Equipment name, e.g. Kettle" autocomplete="off" enterkeyhint="done">
    <div class="seg">${['Class I', 'Class II', 'Lead'].map((c) => `<button class="${c === qcls ? 'on' : ''}" data-act="svQcls" data-v="${c}">${c}</button>`).join('')}</div>
    <button class="btn pq-p" data-act="svQadd" data-id="${j.id}" data-v="Pass">✓ Pass</button><button class="btn pq-f" data-act="svQadd" data-id="${j.id}" data-v="Fail">✕ Fail</button></div>
    <p class="hint" style="margin:6px 0 10px">${d.reg.length} tested · ${pass} passed · ${failN} failed. Press Enter to add as a pass.</p>` : '';
  const reg = f.register ? `<div class="panel"><div class="sect" style="margin-bottom:8px"><h3>${esc(f.register.t)} <span class="muted">(${d.reg.length})</span></h3>${ro || f.quick ? '' : `<button class="btn sm" data-act="svRegAdd" data-id="${j.id}">+ Add row</button>`}</div>${quick}
    ${d.reg.length ? `<div class="tw"><table class="svreg"><thead><tr>${f.register.cols.map((c) => `<th>${esc(c.l)}</th>`).join('')}${ro ? '' : '<th></th>'}</tr></thead><tbody>${d.reg.map((r) => `<tr class="${f.register.fail(r) ? 'od' : ''}">${f.register.cols.map((c) => `<td${c.w ? ` style="width:${c.w}px"` : ''}>${cell(j, `reg.${r.id}.${c.k}`, r[c.k] || '', c.o, ro)}</td>`).join('')}${ro ? '' : `<td><button class="btn sm ghost" data-act="svRegDel" data-id="${j.id}" data-r="${r.id}" aria-label="Remove row">✕</button></td>`}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted" style="margin:0">${ro ? 'None recorded.' : 'Add a row for each item. Failed items become findings automatically.'}</p>`}</div>` : '';
  const readings = f.readings ? `<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Readings</h3><div class="g2">${f.readings.map((r) => ro ? `<div><span class="muted">${esc(r.l)}</span><br>${esc(d.r[r.k] || '—')}</div>` : `<label>${esc(r.l)}<input id="sj-${j.id.slice(0, 8)}-r-${r.k}" data-sj="${j.id}|r.${r.k}" value="${esc(d.r[r.k] || '')}"></label>`).join('')}</div></div>` : '';
  const fxEdit = (x, i) => `<div class="cbox"><div class="svfx"><span class="hn" style="font-size:13px;padding:4px 8px">${i + 1}</span>
      ${ro ? `<span style="flex:1">${esc(x.text)}</span><span class="tag ${sevHi(x.sev) ? 'bad' : sevMid(x.sev) ? 'warn' : ''}">${esc(x.sev)}</span><span class="muted">${esc(x.ts)}</span>`
        : `<input id="${sid('x' + x.id.slice(0, 6))}" data-sj="${j.id}|fx.${x.id}.text" value="${esc(x.text)}" placeholder="What is wrong and what needs doing" style="flex:1">${isFra(j) ? '' : cell(j, `fx.${x.id}.sev`, x.sev, sevsOf(j), false, ' aria-label="Severity" style="width:110px"')}${cell(j, `fx.${x.id}.ts`, x.ts, Object.keys(TS), false, ' aria-label="Timescale" style="width:190px"')}
        ${x.src.startsWith('m:') || x.edited ? `<button class="btn sm ghost" data-act="svFxDel" data-id="${j.id}" data-x="${x.id}" aria-label="Remove">✕</button>` : ''}`}</div>
      ${isFra(j) ? `<div class="rates" style="margin-top:6px"><span class="muted" style="font-size:12.5px">Risk rating</span>${rateBtns(x)}</div>` : ''}
      <div style="margin-top:6px">${thumbs(photosOf(x), 'fx', x.id)}</div></div>`;
  let fx;
  if (isFra(j)) {
    const plan = d.fx.filter((x) => x.src.startsWith('q:')), extra = d.fx.filter((x) => !x.src.startsWith('q:')), ctl = itemsOf(j).filter(([k]) => d.ans[k]?.a === 'Yes');
    fx = `<div class="panel"><div class="sect" style="margin-bottom:8px"><div><h3>Action plan <span class="muted">(${d.fx.length})</span></h3><p class="hint" style="margin-top:2px">Every "No" is added here with its risk rating. Each becomes an action for the site when the assessment is issued.</p></div>${ro ? '' : `<button class="btn sm" data-act="svFxAdd" data-id="${j.id}">+ Other action</button>`}</div>
      ${plan.length ? `<div class="tw"><table class="stack"><thead><tr><th>Risk</th><th>Section</th><th>Non-conformance</th><th>Timescale</th><th>Photos</th></tr></thead><tbody>${plan.map((x) => `<tr><td data-l="Risk"><span class="ratechip" style="--rc:${RATE[x.sev]?.c || '#999'};color:${RATE[x.sev]?.t || '#fff'}">${esc(x.sev)}</span></td><td data-l="Section"><b>${esc(x.cat)}</b><br><span class="muted">${esc(x.q)}</span></td><td data-l="Non-conformance">${x.text ? esc(x.text) : '<span class="od-t">Describe it under the question</span>'}</td><td data-l="Timescale">${esc(x.ts)}</td><td data-l="Photos">${photosOf(d.ans[x.src.slice(2)]).length || '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin:0">No non-conformances.</p>'}
      ${extra.length ? `<h4 style="margin:14px 0 6px">Other actions</h4>${extra.map((x, i) => fxEdit(x, plan.length + i)).join('')}` : ''}</div>
      <div class="panel"><h3 style="font-size:16px;margin-bottom:6px">Controls in place <span class="muted">(${ctl.length})</span></h3>${ctl.length ? ctl.map(([k, q]) => `<div class="li"><span class="tag ok">Yes</span><span style="flex:1"><b>${esc(q)}</b><br><span class="muted">${esc(groupOf(j, k))}${d.ans[k].c ? ' · ' + esc(d.ans[k].c) : ''}</span></span>${photosOf(d.ans[k]).length ? `<span class="muted">${photosOf(d.ans[k]).length} photo${photosOf(d.ans[k]).length > 1 ? 's' : ''}</span>` : ''}</div>`).join('') : '<p class="muted" style="margin:0">Questions answered Yes appear here.</p>'}</div>`;
  } else {
    fx = `<div class="panel"><div class="sect" style="margin-bottom:8px"><div><h3>Findings and defects <span class="muted">(${d.fx.length})</span></h3><p class="hint" style="margin-top:2px">Each one becomes an action for the site when the certificate is issued.</p></div>${ro ? '' : `<button class="btn sm" data-act="svFxAdd" data-id="${j.id}">+ Add finding</button>`}</div>
    ${d.fx.length ? d.fx.map((x, i) => fxEdit(x, i)).join('') : `<p class="muted" style="margin:0">No findings.</p>`}</div>`;
  }
  const risk = f.risk ? `<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Overall fire risk</h3><div class="g3">${ro ? `<div><span class="muted">Likelihood of fire</span><br>${esc(d.rl || '—')}</div><div><span class="muted">Harm if a fire happened</span><br>${esc(d.rs || '—')}</div>` : `<label>Likelihood of fire${cell(j, 'rl', d.rl || '', RISK_L)}</label><label>Harm if a fire happened${cell(j, 'rs', d.rs || '', RISK_S)}</label>`}<div><span class="muted">Overall risk</span><br><b style="font-size:18px">${esc(riskOf(d) || '—')}</b></div></div></div>` : '';
  const outcome = `<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Outcome</h3><div class="g3">
    ${ro ? `<div><span class="muted">Overall condition</span><br><span class="tag ${j.outcome === 'Satisfactory' ? 'ok' : 'bad'}">${esc(j.outcome)}</span></div><div><span class="muted">Next ${j.type === 'fra' ? 'review' : 'inspection'}</span><br><b>${fd(j.next_due)}</b> (${j.interval_months} months)</div>`
      : `<label>Overall condition<select id="sj-${j.id.slice(0, 8)}-out" data-sj="${j.id}|col.outcome"><option value=""></option>${['Satisfactory', 'Unsatisfactory'].map((x) => `<option${x === j.outcome ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Next ${j.type === 'fra' ? 'review' : 'inspection'} within<select id="sj-${j.id.slice(0, 8)}-int" data-sj="${j.id}|col.interval_months">${[...new Set(f.months.concat(j.interval_months))].sort((a, b) => a - b).map((x) => `<option value="${x}"${x === j.interval_months ? ' selected' : ''}>${x} month${x > 1 ? 's' : ''}</option>`).join('')}</select></label><div><span class="muted">Next due</span><br><b>${fd(nextDue(j))}</b></div>`}
    ${ro ? `<div class="full"><span class="muted">${isFra(j) ? 'Executive summary' : 'Comments'}</span><br>${esc(d.summary || '—')}</div>` : `<label class="full">${isFra(j) ? 'Executive summary' : 'Comments and recommendations'}<textarea id="sj-${j.id.slice(0, 8)}-sum" data-sj="${j.id}|summary" style="min-height:${isFra(j) ? 140 : 60}px">${esc(d.summary)}</textarea></label>`}</div></div>`;
  const cert = ro ? `<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Certification</h3><div class="g3"><div><span class="muted">Engineer</span><br><b>${esc(j.engineer_name)}</b><br><span class="muted">${esc(j.engineer_quals || '')}</span>${j.engineer_sig ? `<br><img class="sig" src="${esc(j.engineer_sig)}" alt="Engineer signature">` : ''}</div>
    <div><span class="muted">${esc(f.approver || 'Checked by')}</span><br>${esc(j.approver_name || '—')}${j.approver_sig ? `<br><img class="sig" src="${esc(j.approver_sig)}" alt="Signature">` : ''}</div><div><span class="muted">Customer</span><br>${esc(j.customer_name || '—')}${j.customer_sig ? `<br><img class="sig" src="${esc(j.customer_sig)}" alt="Signature">` : ''}</div></div><p class="hint">Issued ${ft(j.issued_at)}. Issued certificates can't be changed; start a new visit to correct one.</p></div>` : '';
  return `<div class="svhead" style="border-top:6px solid ${f.color}"><div class="row"><a class="btn sm ghost" href="#/services">← Service jobs</a><div class="row sp"><button class="btn sm" data-act="svPdf" data-id="${j.id}">${ro ? 'Certificate PDF' : 'Preview PDF'}</button>${ro ? '' : `<button class="btn sm dng" data-act="svDel" data-id="${j.id}">Delete draft</button><button class="btn sm pri" data-act="svCertify" data-id="${j.id}">Certify and issue</button>`}</div></div>
  <div class="row" style="margin-top:8px">${tag(j)}${statusTag(j)}</div><h2 style="margin:8px 0 4px">${esc(f.name)}</h2>
  <div class="meta"><b style="color:var(--ink)">${esc(j.cert_no)}</b><span>${esc(cName(j.client_id))} · ${esc(st.name)}</span><span>${esc(f.std)}</span>${ro ? '' : `<span>${m.answers ? `<b style="color:var(--vh)">${m.answers} checks to answer</b>` : 'All checks answered'}${m.nc ? ` · <b style="color:var(--vh)">${m.nc} non-conformance${m.nc > 1 ? 's' : ''} to describe</b>` : ''}</span>`}</div></div>
  <div class="page"><div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Visit details</h3><div class="g3">
    ${ro ? `<div><span class="muted">Visit date</span><br>${fd(j.visit_date)}</div><div><span class="muted">Visit type</span><br>${esc(d.visit_type)}</div><div><span class="muted">Site address</span><br>${esc(st.address || '—')}</div>`
      : `<label>Visit date<input id="sj-${j.id.slice(0, 8)}-vd" type="date" data-sj="${j.id}|col.visit_date" value="${esc(j.visit_date)}"></label><label>Visit type${cell(j, 'visit_type', d.visit_type, f.visitTypes)}</label><div><span class="muted">Site address</span><br>${esc(st.address || '—')}</div>`}
    ${f.fields.map((x) => fieldBlock(j, x, ro)).join('')}</div></div>
  ${groups}${reg}${readings}${fx}${risk}${outcome}${cert}
  ${ro ? '' : `<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn pri" data-act="svCertify" data-id="${j.id}">Certify and issue certificate</button></div>`}</div>`;
}

// Quick PAT entry: Enter adds the item as a pass.
document.addEventListener('keydown', (e) => { if (e.target.id === 'pq-name' && e.key === 'Enter') { e.preventDefault(); document.querySelector('[data-act=svQadd][data-v=Pass]')?.click(); } });

// ---------- photos ----------
async function photoUrls(j) {
  const need = Object.values(j.data.ans).flatMap(photosOf).concat(j.data.fx.flatMap(photosOf)).filter((p) => p && !(p in S.urls));
  if (!need.length) return;
  need.forEach((p) => (S.urls[p] = ''));
  await Promise.all(need.map(async (p) => { const { data } = await sb.storage.from('compliance').createSignedUrl(p, 3600); S.urls[p] = data?.signedUrl || ''; }));
  window.__render();
}
async function shrink(file) {
  const img = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.72));
}
// Photos go under a checklist question (a control in place or a non-conformance) or under a finding.
async function addPhotos(j, kind, key, files) {
  if (!files || !files.length) return;
  const tgt = kind === 'ans' ? (j.data.ans[key] ||= {}) : j.data.fx.find((y) => y.id === key); if (!tgt) return;
  try {
    toast(`Uploading ${files.length > 1 ? files.length + ' photos' : 'photo'}…`);
    for (const file of files) {
      const blob = await shrink(file), path = `${j.client_id}/${j.site_id}/service/${j.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from('compliance').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      tgt.photos = photosOf(tgt).concat(path); delete tgt.photo;
    }
    await upd('service_jobs', j.id, { data: j.data }); toast(files.length > 1 ? 'Photos added' : 'Photo added'); window.__render();
  } catch (e) { toast('Photo upload failed: ' + (e.message || e), true); }
}

// ---------- events ----------
export function svField(el, isChange) {
  const [id, path] = el.dataset.sj.split('|'), j = byId('service_jobs', id); if (!j || j.status === 'Issued') return false;
  let p = path.split('.');
  // Question numbers can contain dots (e.g. 1.5b): ans.<key>.<field>
  if (p[0] === 'ans' && p.length > 3) p = ['ans', p.slice(1, -1).join('.'), p[p.length - 1]];
  if (el.type === 'file') { addPhotos(j, p[0], p[1], [...el.files]); return false; }
  const v = el.value;
  if (p[0] === 'col') {
    const k = p[1], val = k === 'interval_months' ? +v : v || null;
    upd('service_jobs', j.id, { [k]: val }).catch(() => {}); return true;
  }
  const d = j.data;
  if (p[0] === 'f' || p[0] === 'r') d[p[0]][p[1]] = v;
  else if (p[0] === 'ans') { d.ans[p[1]] = { ...(d.ans[p[1]] || {}), c: v }; const x = d.fx.find((y) => y.src === 'q:' + p[1]); if (x && isFra(j)) x.text = v; else if (x && !x.edited) x.text = qOf(j, p[1]) + (v ? ' — ' + v : ''); }
  else if (p[0] === 'reg') { const r = d.reg.find((y) => y.id === p[1]); if (r) r[p[2]] = v; syncFindings(j); const x = d.fx.find((y) => y.src === 'r:' + p[1]); if (x && !x.edited && F(j).register.fail(r)) x.text = F(j).register.label(r); }
  else if (p[0] === 'fx') { const x = d.fx.find((y) => y.id === p[1]); if (x) { x[p[2]] = v; x.edited = true; } }
  else if (p[0] === 'visit_type') { d.visit_type = v; if (j.type === 'el') { const m = /Monthly/.test(v) ? 1 : 12; upd('service_jobs', j.id, { interval_months: m }).catch(() => {}); } }
  else d[p[0]] = v;
  if (p[0] === 'visit_type') syncFindings(j);
  save(j, isChange ? 0 : 700);
  return isChange && el.tagName === 'SELECT';
}

export async function svClick(d, btn) {
  const j = d.id && byId('service_jobs', d.id);
  switch (d.act) {
    case 'svNew': newModal(d.s, d.t); return true;
    case 'svCreate': {
      const sid = $('#svn-s').value, t = $('#svn-t').value, s = byId('sites', sid); if (!s) { toast('Choose a site', true); return true; }
      const row = { id: uid(), site_id: sid, client_id: s.client_id, type: t, cert_no: newCertNo(t), status: 'Draft', visit_date: today(), interval_months: FORMS[t].defMonths, data: blankData(t), engineer_name: window.__me?.full_name || null };
      const prev = rows('service_jobs').filter((x) => x.created_by === window.__me?.id && x.engineer_quals).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]; if (prev) row.engineer_quals = prev.engineer_quals;
      const last = rows('service_jobs').filter((x) => x.site_id === sid && x.type === t && x.status === 'Issued').sort((a, b) => b.visit_date.localeCompare(a.visit_date))[0];
      if (last) { row.data.f = { ...last.data.f }; if (FORMS[t].register) row.data.reg = last.data.reg.map((r) => ({ ...r, id: uid(), res: '', vis: '', earth: '', ins: '', work: r.work ? '' : r.work })); if (t === 'fra') row.data.visit_type = 'Review of previous assessment'; }
      closeModal(); await ins('service_jobs', row).catch(() => {}); location.hash = '#/service/' + row.id; return true;
    }
    case 'svAns': { if (!j || j.status === 'Issued') return true; const cur = j.data.ans[d.k] || {}; j.data.ans[d.k] = { ...cur, a: cur.a === d.v ? '' : d.v }; syncFindings(j); save(j, 0); window.__render(); return true; }
    case 'svRegAdd': { const prev = j.data.reg[j.data.reg.length - 1]; const r = { id: uid() }; if (prev && j.type === 'el') r.no = String((+prev.no || j.data.reg.length) + 1); if (prev && j.type === 'pat') r.loc = prev.loc; if (prev && j.type === 'ext') r.work = prev.work; j.data.reg.push(r); save(j, 0); window.__render(); return true; }
    case 'svRegDel': { j.data.reg = j.data.reg.filter((r) => r.id !== d.r); syncFindings(j); save(j, 0); window.__render(); return true; }
    case 'svFxAdd': j.data.fx.push({ id: uid(), src: 'm:' + uid().slice(0, 8), text: '', sev: defSev(j), ts: isFra(j) ? RATE[defSev(j)].ts : 'Short term (1 month)' }); save(j, 0); window.__render(); return true;
    case 'svQcls': S.qcls = d.v; window.__render(); setTimeout(() => $('#pq-name')?.focus(), 0); return true;
    case 'svQadd': { const name = ($('#pq-name')?.value || '').trim(); if (!name) { toast('Type the equipment name', true); $('#pq-name')?.focus(); return true; }
      j.data.reg.unshift({ id: uid(), desc: name, cls: S.qcls || 'Class I', res: d.v }); syncFindings(j); save(j, 0); window.__render(); setTimeout(() => { const i = $('#pq-name'); if (i) { i.value = ''; i.focus(); } }, 0); return true; }
    case 'svSev': { const x = j.data.fx.find((y) => y.id === d.x); if (x) { x.sev = d.v; x.ts = RATE[d.v]?.ts || x.ts; } save(j, 0); window.__render(); return true; }
    case 'svPhDel': { const t = d.kind === 'ans' ? j.data.ans[d.k] : j.data.fx.find((y) => y.id === d.k); if (t) { t.photos = photosOf(t).filter((x) => x !== d.p); delete t.photo; } save(j, 0); window.__render(); return true; }
    case 'svFxDel': j.data.fx = j.data.fx.filter((x) => x.id !== d.x); save(j, 0); window.__render(); return true;
    case 'svDel': if (await confirmBox('Delete this draft service job?')) { await del('service_jobs', j.id).catch(() => {}); location.hash = '#/services'; } return true;
    case 'svPdf': await certPDF(j, 'save'); return true;
    case 'svCertify': certifyModal(j); return true;
    case 'svIssue': await issue(j, btn); return true;
  }
  return false;
}

function newModal(sid, t) {
  const pre = sid && byId('sites', sid), cid = pre ? pre.client_id : rows('clients')[0]?.id;
  if (!cid) return toast('Onboard a client first', true);
  const siteOpts = (c) => rows('sites').filter((s) => s.client_id === c).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.id}"${s.id === sid ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  openModal(`<h3>New service job</h3><div class="g2"><label class="full">Service<select id="svn-t">${Object.entries(FORMS).map(([k, f]) => `<option value="${k}"${k === t ? ' selected' : ''}>${esc(f.name)} — ${esc(f.std)}</option>`).join('')}</select></label>
  <label>Client<select id="svn-c">${[...rows('clients')].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>Site<select id="svn-s">${siteOpts(cid)}</select></label></div>
  <p class="hint">If the site has an earlier certificate for this service, its details and item list are copied in for you to re-test.</p>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="svCreate">Start job</button></div>`);
  $('#svn-c').onchange = (e) => { $('#svn-s').innerHTML = siteOpts(e.target.value); };
}

function certifyModal(j) {
  const m = missing(j), f = F(j);
  if (m.answers || m.nc || m.outcome || m.risk) return toast([m.answers ? `${m.answers} checks still to answer` : '', m.nc ? `describe ${m.nc} non-conformance${m.nc > 1 ? 's' : ''}` : '', m.outcome ? 'choose the overall condition' : '', m.risk ? 'set the overall fire risk' : ''].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()), true);
  const unsat = j.outcome === 'Unsatisfactory', hi = j.data.fx.filter((x) => sevHi(x.sev)).length;
  openModal(`<h3>Certify and issue — ${esc(j.cert_no)}</h3>
  <p class="stmt">${esc(statement(j))}</p>
  ${hi && !unsat ? `<p class="hint" style="color:var(--vh)">There ${hi === 1 ? 'is 1 high-severity finding' : `are ${hi} high-severity findings`} but the outcome is Satisfactory. Check this is right.</p>` : ''}
  <div class="g2"><label>Engineer's name<input id="svc-en" value="${esc(j.engineer_name || window.__me?.full_name || '')}"></label><label>Qualifications / position<input id="svc-eq" value="${esc(j.engineer_quals || '')}" placeholder="e.g. CMIOSH, MIFSM, NAFRAR Tier 2"></label></div>
  <label style="margin-top:10px">Engineer's signature<canvas class="sigpad" id="svc-pe" style="height:130px"></canvas></label><button class="btn sm" type="button" id="svc-ce">Clear</button>
  <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">${esc(f.approver || 'Checked by')} (optional)</summary><label style="margin-top:8px">Name<input id="svc-an"></label><canvas class="sigpad" id="svc-pa" style="height:110px;margin-top:6px"></canvas></details>
  <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Customer acknowledgement (optional)</summary><label style="margin-top:8px">Customer name<input id="svc-cn"></label><canvas class="sigpad" id="svc-pc" style="height:110px;margin-top:6px"></canvas></details>
  <p class="hint">Issuing locks the certificate, files the PDF in ${esc(site(j).name)}'s Compliance centre (expires ${fd(nextDue(j))}) and raises ${j.data.fx.length} action${j.data.fx.length === 1 ? '' : 's'}.</p>
  <div class="ft"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="svIssue" data-id="${j.id}">Issue certificate</button></div>`, true);
  const pads = { e: signaturePad($('#svc-pe')) };
  $('#svc-ce').onclick = () => pads.e.clear();
  document.querySelectorAll('#modal details').forEach((dt) => dt.addEventListener('toggle', () => { if (!dt.open) return; const c = dt.querySelector('canvas'); const k = c.id.slice(-1); if (!pads[k]) pads[k] = signaturePad(c); }));
  window.__svpads = pads;
}
const statement = (j) => `I certify that the ${j.type === 'fra' ? 'fire risk assessment of the premises' : F(j).subject + ' at the premises'} described in this certificate was ${j.type === 'fra' ? 'carried out' : 'inspected and tested'} on ${fd(j.visit_date)} in accordance with ${F(j).stdLong}, and that the results and findings are recorded in this certificate to the best of my knowledge and belief.`;

async function issue(j, btn) {
  const pads = window.__svpads || {}, en = $('#svc-en').value.trim(), eq = $('#svc-eq').value.trim();
  if (en.length < 2) return toast('Enter the engineer\'s name', true);
  if (!pads.e || pads.e.isEmpty()) return toast('The engineer must sign', true);
  const an = $('#svc-an').value.trim(), cn = $('#svc-cn').value.trim();
  const sig = { engineer_name: en, engineer_quals: eq || null, engineer_sig: pads.e.toDataURL(), approver_name: an || null, approver_sig: an && pads.a && !pads.a.isEmpty() ? pads.a.toDataURL() : null, customer_name: cn || null, customer_sig: cn && pads.c && !pads.c.isEmpty() ? pads.c.toDataURL() : null };
  btn.disabled = true; btn.textContent = 'Issuing…';
  try {
    const issued = { ...j, ...sig, status: 'Issued', issued_at: new Date().toISOString(), next_due: nextDue(j) };
    const blob = await certPDF(issued, 'blob');
    const path = `${j.client_id}/${j.site_id}/${uid()}-${j.cert_no}.pdf`;
    const up = await sb.storage.from('compliance').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    const dt = rows('compliance_doc_types').find((t) => F(j).doc.test(t.name));
    const docId = uid();
    if (dt) await ins('site_documents', { id: docId, site_id: j.site_id, client_id: j.client_id, doc_type_id: dt.id, not_applicable: false, issue_date: j.visit_date, expiry_date: issued.next_due, provider: 'Safetybiz', reference: j.cert_no, notes: `${j.outcome}. ${j.data.fx.length} finding${j.data.fx.length === 1 ? '' : 's'}.`, file_path: path, file_name: `${j.cert_no}.pdf`, file_size: blob.size });
    await upd('service_jobs', j.id, { ...sig, status: 'Issued', site_document_id: dt ? docId : null });
    const fresh = await fetchAll('service_jobs', '*', (q) => q.eq('id', j.id)); if (fresh[0]) Object.assign(j, fresh[0]);
    for (const x of j.data.fx) {
      const days = TS[x.ts] ?? 30;
      await ins('actions', { site_id: j.site_id, service_job_id: j.id, source: 'service', title: (fxTitle(j, x) || 'Defect').slice(0, 500), due_date: addDays(j.visit_date, days), priority: x.ts === 'Immediate' ? 'Urgent' : PRIO[x.sev] || 'Medium', severity: x.sev, timescale: x.ts, status: 'Open', owner: null }).catch(() => {});
    }
    closeModal(); toast(`Certificate ${j.cert_no} issued and filed`); window.__render();
  } catch (e) { btn.disabled = false; btn.textContent = 'Issue certificate'; toast('Could not issue: ' + (e.message || e), true); }
}

// ---------- certificate PDF ----------
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK = [16, 41, 43], MUTE = [93, 111, 112], LINE = [227, 232, 231];
async function imgData(path) {
  try { const { data } = await sb.storage.from('compliance').createSignedUrl(path, 300); const b = await (await fetch(data.signedUrl)).blob();
    const im = await createImageBitmap(b), c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
    return { url: c.toDataURL('image/jpeg', 0.85), w: im.width, h: im.height }; } catch { return null; }
}
export async function certPDF(j, mode) {
  try {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), f = F(j), d = j.data, st = site(j), W = 210, M = 14, col = rgb(f.color);
    const draft = j.status !== 'Issued';
    const tbl = (opts) => { doc.autoTable({ margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: col, textColor: 255, fontStyle: 'bold' }, ...opts }); return doc.lastAutoTable.finalY; };
    const ensure = (y, need) => { if (y + need > 278) { doc.addPage(); return 18; } return y; };
    const bar = (y, t) => { y = ensure(y, 14); doc.setFillColor(...col); doc.rect(M, y, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255); doc.text(t.toUpperCase(), M + 2.5, y + 4.8); doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); return y + 9; };
    // header
    doc.addImage(LOGO, 'PNG', M, 9, 44, 11.5);
    doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.text(SB_CONTACT, W - M, 13, { align: 'right' }); doc.text('Certificate no. ' + j.cert_no, W - M, 18, { align: 'right' });
    doc.setFillColor(...col); doc.rect(0, 25, W, 20, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(f.title, M, 33.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`In accordance with ${f.stdLong}`, M, 38.5, { maxWidth: W - 2 * M });
    doc.setTextColor(...INK);
    let y = 50;
    // outcome box
    const ok = j.outcome === 'Satisfactory';
    doc.setFillColor(...(j.outcome ? (ok ? [227, 245, 240] : [253, 238, 234]) : [241, 243, 243])); doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'F');
    doc.setFontSize(8); doc.setTextColor(...MUTE); doc.text('OVERALL CONDITION', M + 4, y + 5); doc.text(j.type === 'fra' ? 'OVERALL FIRE RISK' : 'VISIT', M + 66, y + 5); doc.text(j.type === 'fra' ? 'NEXT REVIEW BY' : 'NEXT INSPECTION BY', M + 128, y + 5);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(j.outcome ? (ok ? [31, 125, 109] : [215, 38, 30]) : MUTE)); doc.text(j.outcome || 'Not yet set', M + 4, y + 11);
    doc.setTextColor(...INK); doc.text(j.type === 'fra' ? riskOf(d) || '—' : (d.visit_type || '—').replace(/\s*\(.*\)/, ''), M + 66, y + 11, { maxWidth: 60 }); doc.text(fd(j.next_due || nextDue(j)), M + 128, y + 11); doc.setFont('helvetica', 'normal');
    y += 18;
    y = bar(y, 'Client and premises');
    y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.6 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 38 } },
      body: [['Client', cName(j.client_id), 'Visit date', fd(j.visit_date)], ['Premises', st.name || '', 'Visit type', d.visit_type || ''], ['Address', st.address || '—', 'Certificate no.', j.cert_no], ['Contractor', 'Safetybiz', 'Engineer', [j.engineer_name, j.engineer_quals].filter(Boolean).join(', ') || '—']] }) + 3;
    const fields = f.fields.filter((x) => d.f[x.k]);
    // FRA checklist answers are Yes / No / N/A; a No is a non-conformance.
    if (fields.length) { y = bar(y, j.type === 'fra' ? 'Premises information' : 'System details'); y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.6 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } }, body: fields.map((x) => [x.l, x.t === 'date' ? fd(d.f[x.k]) : d.f[x.k]]) }) + 3; }
    if (f.readings && f.readings.some((r) => d.r[r.k])) {
      const rb = f.readings.filter((r) => d.r[r.k]).map((r) => [r.l, d.r[r.k]]);
      if (j.type === 'fa' && d.r.false && +d.f.detectors) rb.push(['False alarm rate', `${((+d.r.false / +d.f.detectors) * 100).toFixed(1)} per 100 detectors per year`]);
      y = bar(y, 'Readings'); y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.6 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } }, body: rb }) + 3;
    }
    // photos drawn in rows of three under the item they belong to
    const photoRow = async (paths) => {
      let x = M, rowH = 0;
      for (const ph of paths) {
        const im = await imgData(ph); if (!im) continue;
        const k = Math.min(56 / im.w, 42 / im.h), w = im.w * k, h = im.h * k;
        if (x > M && x + 56 > W - M + 0.5) { y += rowH + 3; x = M; rowH = 0; }
        if (y + h > 280) { doc.addPage(); y = 18; }
        try { doc.addImage(im.url, 'JPEG', x, y, w, h); } catch { /* skip */ }
        x += 60; rowH = Math.max(rowH, h);
      }
      if (rowH) y += rowH + 3;
    };
    const rateCell = (c) => { const r = RATE[c.cell.raw]; if (r) { c.cell.styles.fillColor = rgb(r.c); c.cell.styles.textColor = r.t ? rgb(r.t) : 255; c.cell.styles.fontStyle = 'bold'; c.cell.styles.halign = 'center'; } };
    if (isFra(j)) {
      if (d.summary) { y = bar(y, 'Executive summary'); y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 8.8, cellPadding: 1.8 }, body: [[d.summary]] }) + 3; }
      y = bar(y, 'Risk rating key');
      y = tbl({ startY: y, theme: 'grid', head: [['Rating', 'What it means', 'Timescale']], headStyles: { fillColor: [239, 247, 245], textColor: INK }, columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 40 } },
        body: Object.entries(RATE).map(([k, v]) => [k, v.d, v.ts]), didParseCell: (c) => { if (c.section === 'body' && c.column.index === 0) rateCell(c); } }) + 3;
      y = bar(y, 'Overall fire risk');
      y = tbl({ startY: y, theme: 'grid', styles: { halign: 'center', fontSize: 8 }, head: [['Likelihood of fire / Harm'].concat(RISK_S)], headStyles: { fillColor: [239, 247, 245], textColor: INK },
        body: RISK_L.map((l, i) => [l].concat(RISK_M[i])),
        didParseCell: (c) => { if (c.section === 'body' && c.column.index > 0 && RISK_L[c.row.index] === d.rl && RISK_S[c.column.index - 1] === d.rs) { c.cell.styles.fillColor = col; c.cell.styles.textColor = 255; c.cell.styles.fontStyle = 'bold'; } } }) + 3;
      y = bar(y, `Action plan (${d.fx.length})`);
      y = d.fx.length ? tbl({ startY: y, theme: 'grid', head: [['#', 'Section', 'Risk', 'Non-conformance and action required', 'Timescale']], headStyles: { fillColor: [239, 247, 245], textColor: INK },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 48 }, 2: { cellWidth: 24 }, 4: { cellWidth: 28 } },
        body: d.fx.map((x, i) => [i + 1, x.cat ? `${x.cat}\n${x.q}` : 'Other', x.sev, x.text || '', x.ts]), didParseCell: (c) => { if (c.section === 'body' && c.column.index === 2) rateCell(c); } }) + 3
        : tbl({ startY: y, theme: 'plain', body: [['No non-conformances were found.']] }) + 3;
      const ctl = itemsOf(j).filter(([k]) => d.ans[k]?.a === 'Yes');
      y = bar(y, `Controls in place (${ctl.length})`);
      y = ctl.length ? tbl({ startY: y, theme: 'grid', head: [['Section', 'Question', 'Control in place / observation']], headStyles: { fillColor: [239, 247, 245], textColor: INK }, columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 62 } },
        body: ctl.map(([k, q]) => [groupOf(j, k), q, d.ans[k].c || 'In place']) }) + 3 : tbl({ startY: y, theme: 'plain', body: [['None recorded.']] }) + 3;
      // certification
      y = bar(ensure(y, 70), 'Certification');
      doc.setFontSize(8.5); const stl = doc.splitTextToSize(statement(j), W - 2 * M); doc.text(stl, M, y + 3); y += stl.length * 4 + 4;
      const sigBox = (x, label, name, extra, img, when) => {
        doc.setDrawColor(...LINE); doc.rect(x, y, 58, 34); doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.text(label, x + 2, y + 4);
        if (img) { try { doc.addImage(img, 'PNG', x + 2, y + 6, 54, 14); } catch { /* skip */ } }
        doc.setTextColor(...INK); doc.setFontSize(8.5); doc.text(name || '—', x + 2, y + 25, { maxWidth: 54 }); doc.setFontSize(7.3); doc.setTextColor(...MUTE); if (extra) doc.text(extra, x + 2, y + 29, { maxWidth: 54 }); if (when) doc.text(when, x + 2, y + 32.5);
      };
      sigBox(M, 'Engineer', j.engineer_name, j.engineer_quals, j.engineer_sig, j.issued_at ? ft(j.issued_at) : '');
      sigBox(M + 62, f.approver || 'Checked by', j.approver_name, '', j.approver_sig, '');
      sigBox(M + 124, 'Customer / responsible person', j.customer_name, '', j.customer_sig, '');
      y += 40;
      // full report: every question with its answer, observation and photos
      doc.addPage(); y = 18; y = bar(y, 'Full report');
      for (const g of groupsOf(j)) {
        y = ensure(y, 22); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...col); doc.text(g.t, M, y + 4); doc.setDrawColor(...col); doc.line(M, y + 6, W - M, y + 6); y += 9;
        for (const [k, q] of g.items) {
          const an = d.ans[k] || {}, x = d.fx.find((z) => z.src === 'q:' + k), ql = doc.splitTextToSize(`${k}  ${q}`, W - 2 * M - 46), h = ql.length * 4 + 3;
          y = ensure(y, h + 10 + (an.c ? doc.splitTextToSize(an.c, W - 2 * M - 4).length * 4 : 0) + (photosOf(an).length ? 46 : 0));
          doc.setFillColor(242, 244, 244); doc.rect(M, y, W - 2 * M, h, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(ql, M + 2, y + 4.3);
          const res = an.a || '—', rc = x ? rgb(RATE[x.sev]?.c || '#D7261E') : res === 'Yes' ? [31, 125, 109] : MUTE;
          doc.setFillColor(...rc); doc.roundedRect(W - M - 42, y + 1, 40, 5.2, 1.5, 1.5, 'F'); doc.setTextColor(...(x && RATE[x.sev]?.t ? rgb(RATE[x.sev].t) : [255, 255, 255])); doc.setFontSize(7.6); doc.text(x ? `${res} · ${x.sev}` : res === 'Yes' ? 'Yes · in place' : res, W - M - 22, y + 4.6, { align: 'center' });
          y += h + 2; doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.setFontSize(8.5);
          if (an.c) { const cl = doc.splitTextToSize(an.c, W - 2 * M - 4); y = ensure(y, cl.length * 4 + 2); doc.text(cl, M + 2, y + 3); y += cl.length * 4 + 2; }
          if (x) { doc.setTextColor(...MUTE); doc.setFontSize(7.8); doc.text(`Timescale: ${x.ts}`, M + 2, y + 3); y += 5; }
          await photoRow(photosOf(an)); y += 1;
        }
      }
      const other = d.fx.filter((x) => !x.src.startsWith('q:'));
      if (other.length) { y = bar(ensure(y, 20), 'Other actions'); for (const x of other) { doc.setFontSize(8.5); doc.setTextColor(...INK); const tl = doc.splitTextToSize(`${x.sev} · ${x.ts} — ${x.text}`, W - 2 * M); y = ensure(y, tl.length * 4 + 4); doc.text(tl, M, y + 3); y += tl.length * 4 + 2; await photoRow(photosOf(x)); } }
    } else {
      // checklist
      for (const g of groupsOf(j)) {
        y = bar(y, g.t);
        y = tbl({ startY: y, theme: 'grid', head: [['#', 'Check', 'Result', 'Comment']], headStyles: { fillColor: [239, 247, 245], textColor: INK }, columnStyles: { 0: { cellWidth: 9 }, 2: { cellWidth: 22, fontStyle: 'bold' }, 3: { cellWidth: 52 } },
          body: g.items.map(([k, q]) => [k, q, d.ans[k]?.a || '—', (d.ans[k]?.c || '') + (photosOf(d.ans[k]).length ? `${d.ans[k]?.c ? '\n' : ''}(${photosOf(d.ans[k]).length} photo${photosOf(d.ans[k]).length > 1 ? 's' : ''})` : '')]),
          didParseCell: (c) => { if (c.section === 'body' && c.column.index === 2) { const v = c.cell.raw; c.cell.styles.textColor = v === f.bad ? [215, 38, 30] : v === 'Pass' || v === 'Yes' ? [31, 125, 109] : MUTE; } } }) + 3;
      }
      // register
      if (f.register && d.reg.length) {
        y = bar(y, `${f.register.t} (${d.reg.length})`);
        if (j.type === 'ext') {
          const types = [...new Set(d.reg.map((r) => r.type).filter(Boolean))], works = ['Basic service', 'Extended service', 'Overhaul', 'Commissioned', 'Recharged', 'Replaced', 'Condemned'];
          y = tbl({ startY: y, theme: 'grid', head: [['Type', 'Qty'].concat(works)], headStyles: { fillColor: [239, 247, 245], textColor: INK, fontSize: 7.5 }, styles: { fontSize: 8, halign: 'center' }, columnStyles: { 0: { halign: 'left' } },
            body: types.map((t) => { const rs = d.reg.filter((r) => r.type === t); return [t, rs.length].concat(works.map((w) => rs.filter((r) => r.work === w).length || '')); }) }) + 2;
        }
        y = tbl({ startY: y, theme: 'grid', head: [f.register.cols.map((c) => c.l)], headStyles: { fillColor: [239, 247, 245], textColor: INK }, styles: { fontSize: 7.8 },
          body: d.reg.map((r) => f.register.cols.map((c) => r[c.k] || '')),
          didParseCell: (c) => { if (c.section === 'body' && f.register.fail(d.reg[c.row.index]) && f.register.cols[c.column.index].k === 'res') { c.cell.styles.textColor = [215, 38, 30]; c.cell.styles.fontStyle = 'bold'; } } }) + 3;
      }
      if (j.type === 'fra') {
        y = bar(y, 'Overall fire risk');
        y = tbl({ startY: y, theme: 'grid', styles: { halign: 'center', fontSize: 8 }, head: [['Likelihood / Harm'].concat(RISK_S)], headStyles: { fillColor: [239, 247, 245], textColor: INK },
          body: RISK_L.map((l, i) => [l].concat(RISK_M[i])),
          didParseCell: (c) => { if (c.section === 'body' && c.column.index > 0 && RISK_L[c.row.index] === d.rl && RISK_S[c.column.index - 1] === d.rs) { c.cell.styles.fillColor = col; c.cell.styles.textColor = 255; c.cell.styles.fontStyle = 'bold'; } } }) + 3;
      }
      // findings
      y = bar(y, `Findings and defects (${d.fx.length})`);
      y = d.fx.length ? tbl({ startY: y, theme: 'grid', head: [['#', 'Finding / action required', 'Severity', 'Timescale', 'Photos']], headStyles: { fillColor: [239, 247, 245], textColor: INK }, columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 20 }, 3: { cellWidth: 36 }, 4: { cellWidth: 15 } },
        body: d.fx.map((x, i) => [i + 1, x.text, x.sev, x.ts, (x.src.startsWith('q:') ? photosOf(d.ans[x.src.slice(2)]) : photosOf(x)).length || '']),
        didParseCell: (c) => { if (c.section === 'body' && c.column.index === 2) c.cell.styles.textColor = sevHi(c.cell.raw) ? [215, 38, 30] : sevMid(c.cell.raw) ? [184, 66, 14] : INK; } }) + 3
        : tbl({ startY: y, theme: 'plain', body: [['No defects found.']] }) + 3;
      if (d.summary) { y = bar(y, 'Comments and recommendations'); y = tbl({ startY: y, theme: 'plain', body: [[d.summary]] }) + 3; }
      // certification
      y = bar(ensure(y, 70), 'Certification');
      doc.setFontSize(8.5); const stl = doc.splitTextToSize(statement(j), W - 2 * M); doc.text(stl, M, y + 3); y += stl.length * 4 + 4;
      const sigBox = (x, label, name, extra, img, when) => {
        doc.setDrawColor(...LINE); doc.rect(x, y, 58, 34); doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.text(label, x + 2, y + 4);
        if (img) { try { doc.addImage(img, 'PNG', x + 2, y + 6, 54, 14); } catch { /* skip */ } }
        doc.setTextColor(...INK); doc.setFontSize(8.5); doc.text(name || '—', x + 2, y + 25, { maxWidth: 54 }); doc.setFontSize(7.3); doc.setTextColor(...MUTE); if (extra) doc.text(extra, x + 2, y + 29, { maxWidth: 54 }); if (when) doc.text(when, x + 2, y + 32.5);
      };
      sigBox(M, 'Engineer', j.engineer_name, j.engineer_quals, j.engineer_sig, j.issued_at ? ft(j.issued_at) : '');
      sigBox(M + 62, f.approver || 'Checked by', j.approver_name, '', j.approver_sig, '');
      sigBox(M + 124, 'Customer / responsible person', j.customer_name, '', j.customer_sig, '');
      y += 40;
      // photos, grouped under the check or finding they belong to
      const groupsPh = itemsOf(j).filter(([k]) => photosOf(d.ans[k]).length).map(([k, q]) => [`${k}. ${q}${d.ans[k].a ? ' — ' + d.ans[k].a : ''}`, photosOf(d.ans[k])])
        .concat(d.fx.map((x, i) => [x, i]).filter(([x]) => photosOf(x).length).map(([x, i]) => [`Finding ${i + 1}: ${x.text}`, photosOf(x)]));
      if (groupsPh.length) {
        doc.addPage(); y = 18; y = bar(y, 'Photos');
        for (const [cap, paths] of groupsPh) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK); const tl = doc.splitTextToSize(cap, W - 2 * M); y = ensure(y, tl.length * 4 + 46); doc.text(tl, M, y + 3); y += tl.length * 4 + 2; doc.setFont('helvetica', 'normal'); await photoRow(paths); y += 2; }
      }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i);
      if (draft) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.12 })); doc.setTextColor(215, 38, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(90); doc.text('DRAFT', W / 2, 175, { align: 'center', angle: 35 }); doc.restoreGraphicsState(); doc.setFont('helvetica', 'normal'); } doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.text(`Safetybiz · ${j.cert_no} · ${st.name || ''}${draft ? ' · DRAFT – not a valid certificate' : ''}`, M, 290); doc.text(`Page ${i} of ${n}`, W - M, 290, { align: 'right' }); }
    if (mode === 'blob') return doc.output('blob');
    doc.save(`${j.cert_no}-${(st.name || '').replace(/[^\w]+/g, '-')}.pdf`);
  } catch (e) { console.error(e); toast('Could not create the certificate: ' + e.message, true); if (mode === 'blob') throw e; }
}
