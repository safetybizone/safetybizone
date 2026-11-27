// PDF exports: risk assessment report (laid out like the printed sample) and sign-off records.
import { band, BANDCOL, fd, ft, COMPANY, toast } from './core.js';
import { photoData } from './photos.js';

const TEAL = [21, 63, 67], OR = [250, 70, 22], INK = [16, 41, 43], MUTE = [93, 111, 112], LINE = [227, 232, 231], MINT = [67, 185, 165];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Safetybiz logo (used on every PDF and certificate), embedded so no extra file is needed.
export const LOGO = 'data:image/png;base64,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';
async function logo() { return LOGO; }
function newDoc() { const { jsPDF } = window.jspdf; return new jsPDF({ unit: 'mm', format: 'a4' }); }
const W = 210, M = 14;

function footer(doc, label) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...MUTE);
    doc.text(`${COMPANY} · Safety made easy · ${label}`, M, 290);
    doc.text(`Page ${i} of ${n} · Generated ${ft(new Date())}`, W - M, 290, { align: 'right' });
  }
}
function section(doc, y, title) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.setCharSpace(0.8); doc.text(title.toUpperCase(), M, y);
  const w = doc.getTextWidth(title.toUpperCase()) + title.length * 0.8; doc.setCharSpace(0);
  doc.setDrawColor(...LINE); doc.setLineDashPattern([0.6, 1.2], 0); doc.line(M + w + 4, y - 1.2, W - M, y - 1.2); doc.setLineDashPattern([], 0);
  return y + 6;
}
function ensure(doc, y, need) { if (y + need > 280) { doc.addPage(); return 20; } return y; }
// Photos under a hazard: a caption, then the photos in rows of three.
async function photoBlock(doc, y, items) {
  for (const [cap, paths] of items) {
    if (!paths || !paths.length) continue;
    y = ensure(doc, y, 52); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...MUTE);
    const cl = doc.splitTextToSize(cap, W - 2 * M); doc.text(cl, M, y + 3); y += cl.length * 4 + 2;
    let x = M, rowH = 0;
    for (const p of paths) {
      const im = await photoData(p); if (!im) continue;
      const k = Math.min(56 / im.w, 42 / im.h), w = im.w * k, h = im.h * k;
      if (x > M && x + 56 > W - M + 0.5) { y += rowH + 3; x = M; rowH = 0; }
      if (y + h > 282) { doc.addPage(); y = 20; x = M; rowH = 0; }
      try { doc.addImage(im.url, 'JPEG', x, y, w, h); } catch (e) { /* skip */ }
      x += 60; rowH = Math.max(rowH, h);
    }
    if (rowH) y += rowH + 5;
  }
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
  return y;
}

// Score helpers shared with the screens: N/A answers don't count.
export const ctlScore = (list) => { const n = list.filter((c) => c.state !== 'N/A').length, y = list.filter((c) => c.state === 'In place').length; return { y, n, f: list.filter((c) => c.state === 'Planned').length }; };
export const cmpScore = (items) => { const n = items.filter((i) => i.a === 'Yes' || i.a === 'No').length, y = items.filter((i) => i.a === 'Yes').length; return { y, n, f: items.filter((i) => i.a === 'No').length }; };
// Overall score: a hazard with no control measures counts as one flagged item, so it can never show 100%.
export const raScore = (hazards, general = []) => { const k = ctlScore(hazards.flatMap((h) => h.controls || []).concat(general)), gaps = hazards.filter((h) => !(h.controls || []).length).length; return { y: k.y, n: k.n + gaps, f: k.f + gaps, gaps }; };
// Plain words for a list of controls (no percentage scores on risk assessments).
export const ctlLabel = (list) => { const k = ctlScore(list); return !list.length ? 'No controls — flagged' : k.f ? `${k.f} not in place` : k.n ? 'All in place' : 'All N/A'; };
export const pct = ({ y, n }) => (n ? `${y} / ${n} (${Math.round((y / n) * 100)}%)` : '–');
const STATE = { 'In place': 'Yes — in place', Planned: 'No — not in place', 'N/A': 'N/A' };

// m: { title, ref, client, site, siteAddress, description, people[], compliance[], hazards[{..., controls[], actions[]}], controls[] (general),
//      init_l..res_s, assessor, accompanied_by, assessment_date, review_date, status, versionLabel, summary, approved_by, approved_at,
//      approval_signature, actions[], acks[], audits[] }
export async function assessmentPDF(m) {
  try {
    const doc = newDoc(), lg = await logo();
    const hz = m.hazards || [], comp = m.compliance || [], gen = m.controls || [];
    const cs = cmpScore(comp), ks = raScore(hz, gen);
    // no percentage score on risk assessments: flagged items and actions only
    const flagged = cs.f + ks.f, complete = !!m.approved_at;
    const tbl = (opts) => { doc.autoTable({ margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' }, ...opts }); return doc.lastAutoTable.finalY; };
    const sectionBar = (y, title, right) => tbl({ startY: y, head: [[{ content: title, styles: { halign: 'left' } }, { content: right || '', styles: { halign: 'right' } }]], body: [], columnStyles: { 1: { cellWidth: 60 } } });
    // header
    doc.addImage(lg, 'PNG', M, 10, 44, 11.5);
    doc.setFillColor(...(complete ? MINT : OR)); doc.roundedRect(W - M - 30, 11, 30, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.text(complete ? 'Complete' : 'Incomplete', W - M - 15, 16.3, { align: 'center' });
    doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(19);
    const tl = doc.splitTextToSize(m.title || 'General Risk Assessment', W - 2 * M); doc.text(tl, M, 33);
    let y = 33 + tl.length * 7.5;
    doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(`${fd(m.assessment_date)} / ${m.assessor || '—'}  ·  ${m.ref}  ·  ${m.versionLabel}`, M, y); y += 5;
    y = tbl({ startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 3, halign: 'center' }, headStyles: { fillColor: [239, 247, 245], textColor: INK },
      head: [['Flagged items', 'Actions']], body: [[String(flagged), String(m.actions.length)]] }) + 4;
    y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
      body: [['Client', m.client], ['Site conducted', m.site || '—'], ['Conducted on', fd(m.assessment_date)], ['Prepared by', m.assessor || '—'], ['Location', m.siteAddress || '—'], ['Accompanied by', m.accompanied_by || '—'], ['Renewal date', fd(m.review_date)]] }) + 3;
    if (m.description || (m.people || []).length) {
      y = tbl({ startY: y, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
        body: [m.description ? ['Activity', m.description] : null, (m.people || []).length ? ['People exposed', m.people.join(', ')] : null].filter(Boolean) }) + 3;
    }
    const i0 = (m.init_l || 0) * (m.init_s || 0), r0 = (m.res_l || 0) * (m.res_s || 0);
    if (i0 || r0) {
      y = tbl({ startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 2.5, halign: 'center' }, headStyles: { fillColor: [239, 247, 245], textColor: INK },
        head: [['Overall risk without controls', 'Overall risk with controls', 'Risk rating reduction']],
        body: [[i0 ? `${m.init_s} x ${m.init_l} = ${i0}  ${band(i0).n}` : '–', r0 ? `${m.res_s} x ${m.res_l} = ${r0}  ${band(r0).n}` : '–', i0 && r0 ? `${Math.round(((i0 - r0) / i0) * 100)}%` : '–']],
        didParseCell: (d) => { if (d.section === 'body' && d.column.index < 2) { const v = d.column.index ? r0 : i0; if (v) { d.cell.styles.fillColor = hex(BANDCOL[band(v).k]); d.cell.styles.textColor = band(v).k === 'vh' ? 255 : INK; } } } }) + 5;
    }
    // flagged items
    const flags = comp.filter((c) => c.a === 'No').map((c) => ['Health and Safety Compliance Documents', c.q, 'No' + (c.note ? ` — ${c.note}` : '')])
      .concat(hz.filter((h) => !(h.controls || []).length).map((h) => [h.title, 'No control measures recorded', 'Not in place']), hz.flatMap((h) => (h.controls || []).filter((c) => c.state === 'Planned').map((c) => [h.title, c.title, 'Not in place'])), gen.filter((c) => c.state === 'Planned').map((c) => ['General controls', c.title, 'Not in place']));
    y = sectionBar(ensure(doc, y, 20), 'Flagged items', `${flags.length} flagged`);
    y = flags.length ? tbl({ startY: y, theme: 'plain', body: flags, columnStyles: { 0: { textColor: MUTE, cellWidth: 55 }, 2: { textColor: [215, 38, 30], cellWidth: 40 } } }) + 5 : tbl({ startY: y, theme: 'plain', body: [['Nothing flagged.']] }) + 5;
    // compliance
    if (comp.length) {
      y = sectionBar(ensure(doc, y, 20), 'Health and Safety Compliance Documents', `${cs.f} flagged`);
      y = tbl({ startY: y, theme: 'plain', body: comp.map((c) => [c.q + (c.note ? `\n${c.note}` : ''), c.a || '—']), columnStyles: { 1: { cellWidth: 30, fontStyle: 'bold' } },
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'No') d.cell.styles.textColor = [215, 38, 30]; } }) + 5;
    }
    // hazard sections
    for (const h of hz) {
      const ctl = h.controls || [], sc = ctlScore(ctl), rs = (h.risk_l || 0) * (h.risk_s || 0), acts = h.actions || [];
      y = sectionBar(ensure(doc, y, 30), h.title || 'Untitled hazard', ctlLabel(ctl));
      const body = [];
      if (h.description) body.push([{ content: h.description, colSpan: 2, styles: { textColor: MUTE } }]);
      ctl.forEach((c) => body.push([c.title + (c.description ? `\n${c.description}` : ''), STATE[c.state] || c.state]));
      if (!ctl.length) body.push([{ content: 'No control measures recorded.', colSpan: 2, styles: { textColor: MUTE } }]);
      body.push([{ content: 'Risk score', styles: { fontStyle: 'bold' } }, rs ? `${h.risk_s} x ${h.risk_l} = ${rs}  ${band(rs).n}` : '—']);
      body.push([{ content: 'Actions', styles: { fontStyle: 'bold' } }, acts.length ? acts.map((x) => `${x.title || 'Untitled'} (${x.owner || 'no owner'}, due ${fd(x.due_date)}, ${x.status})`).join('\n') : 'None']);
      body.push([{ content: 'Person affected', styles: { fontStyle: 'bold' } }, (h.people_affected || []).join(', ') || '—']);
      y = tbl({ startY: y, theme: 'plain', body, columnStyles: { 1: { cellWidth: 62 } },
        didParseCell: (d) => { if (d.section !== 'body' || d.column.index !== 1) return; const t = String(d.cell.raw || '');
          if (t.startsWith('No —')) d.cell.styles.textColor = [215, 38, 30]; if (t.startsWith('Yes')) d.cell.styles.textColor = [31, 125, 109];
          if (rs && d.row.raw[0]?.content === 'Risk score') { d.cell.styles.fillColor = hex(BANDCOL[band(rs).k]); d.cell.styles.textColor = band(rs).k === 'vh' ? 255 : INK; } } }) + 5;
      y = await photoBlock(doc, y, ctl.map((c) => ['Control: ' + (c.title || ''), c.photos]).concat(acts.map((x) => ['Action: ' + (x.title || ''), x.photos])));
    }
    if (gen.length) {
      y = sectionBar(ensure(doc, y, 20), 'General controls', ctlLabel(gen));
      y = tbl({ startY: y, theme: 'plain', body: gen.map((c) => [c.title + (c.description ? `\n${c.description}` : ''), STATE[c.state] || c.state]), columnStyles: { 1: { cellWidth: 62 } } }) + 5;
      y = await photoBlock(doc, y, gen.map((c) => ['Control: ' + (c.title || ''), c.photos]));
    }
    const other = m.actions.filter((x) => !x.assessment_hazard_id || !hz.some((h) => h.id === x.assessment_hazard_id));
    if (other.length) {
      y = sectionBar(ensure(doc, y, 20), 'Other actions', String(other.length));
      y = tbl({ startY: y, head: [['Action', 'Owner', 'Due', 'Priority', 'Status']], body: other.map((x) => [x.title || 'Untitled', x.owner || '—', fd(x.due_date), x.priority, x.status]), columnStyles: { 0: { cellWidth: 80 } } }) + 5;
      y = await photoBlock(doc, y, other.map((x) => ['Action: ' + (x.title || ''), x.photos]));
    }
    if (m.audits && m.audits.length) {
      y = sectionBar(ensure(doc, y, 20), 'Audits', String(m.audits.length));
      y = tbl({ startY: y, head: [['Date', 'Auditor', 'Score', 'Outcome', 'Summary']], body: m.audits.map((u) => [fd(u.audit_date), u.auditor || '—', u.score + '%', u.outcome, u.summary || '']), columnStyles: { 4: { cellWidth: 80 } } }) + 5;
    }
    // summary and approval
    y = sectionBar(ensure(doc, y, 20), 'Summary', '');
    y = tbl({ startY: y, theme: 'plain', body: [[{ content: 'Comments', styles: { fontStyle: 'bold', cellWidth: 45 } }, m.summary || '—']] }) + 5;
    y = sectionBar(ensure(doc, y, 45), 'Approval', complete ? 'Approved' : 'Not yet approved');
    y = tbl({ startY: y, theme: 'plain', styles: { minCellHeight: 7 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      body: [['Approved by', m.approved_by || '—'], ['Date and time of approval', m.approved_at ? ft(m.approved_at) : '—'], ["Approver's signature", '']],
      didParseCell: (d) => { if (d.section === 'body' && d.row.index === 2) d.cell.styles.minCellHeight = 22; },
      didDrawCell: (d) => { if (d.section === 'body' && d.row.index === 2 && d.column.index === 1 && m.approval_signature && m.approval_signature.startsWith('data:image')) { try { doc.addImage(m.approval_signature, 'PNG', d.cell.x + 2, d.cell.y + 1, 55, 20); } catch (e) { /* skip */ } } } }) + 6;
    // staff sign-offs
    y = ensure(doc, y, 30); y = sectionBar(y, 'Acknowledgement record', `${m.acks.length} signed`);
    if (!m.acks.length) { doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text('No sign-offs recorded yet.', M, y + 5); }
    else signTable(doc, y, m.acks, false);
    footer(doc, m.ref);
    doc.save(`${(m.ref + ' ' + (m.title || '')).trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-')}.pdf`);
  } catch (e) { console.error(e); toast('Could not create the PDF: ' + e.message, true); }
}

function signTable(doc, y, acks, withAssessment) {
  const head = withAssessment ? [['Signed', 'Name', 'Job title', 'Assessment', 'Site', 'Ver.', 'Method', 'Signature']] : [['Signed', 'Name', 'Job title', 'Version', 'Method', 'Signature']];
  const body = acks.map((a) => withAssessment ? [ft(a.acknowledged_at), a.full_name, a.job_title || '—', a._assessment || '', a._site || '', 'v' + a.version, a.method, ''] : [ft(a.acknowledged_at), a.full_name, a.job_title || '—', 'v' + a.version, a.method, '']);
  const sigCol = head[0].length - 1;
  doc.autoTable({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 7.8, cellPadding: 1.8, textColor: INK, minCellHeight: 11, valign: 'middle' }, headStyles: { fillColor: TEAL, textColor: 255, minCellHeight: 6 },
    head, body, columnStyles: { [sigCol]: { cellWidth: 30 } },
    didDrawCell: (d) => { if (d.section === 'body' && d.column.index === sigCol) { const s = acks[d.row.index].signature; if (s && s.startsWith('data:image')) { try { doc.addImage(s, 'PNG', d.cell.x + 1, d.cell.y + 1, 28, Math.min(d.cell.height - 2, 9)); } catch (e) { /* skip bad image */ } } } } });
}

export async function signOffsPDF({ title, subtitle, acks }) {
  try {
    const doc = newDoc(), lg = await logo();
    doc.addImage(lg, 'PNG', M, 10, 44, 11.5);
    doc.setFontSize(18); doc.setTextColor(...INK); doc.text(title, M, 34);
    doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(subtitle, M, 40);
    doc.text(`${acks.length} sign-off${acks.length === 1 ? '' : 's'}`, W - M, 40, { align: 'right' });
    if (!acks.length) { doc.setTextColor(...INK); doc.text('No sign-offs match.', M, 50); } else signTable(doc, 46, acks, true);
    footer(doc, 'Acknowledgement record');
    doc.save(`Acknowledgement-record-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) { console.error(e); toast('Could not create the PDF: ' + e.message, true); }
}
