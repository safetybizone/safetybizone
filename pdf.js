// PDF exports: risk assessment report (laid out like the printed sample) and sign-off records.
import { band, BANDCOL, fd, ft, COMPANY, toast } from './core.js';

const TEAL = [21, 63, 67], OR = [250, 70, 22], INK = [16, 41, 43], MUTE = [93, 111, 112], LINE = [227, 232, 231], MINT = [67, 185, 165];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
let logoData = null;
async function logo() {
  if (logoData) return logoData;
  const r = await fetch('logo-light-bg.png'); const b = await r.blob();
  logoData = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
  return logoData;
}
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

// Score helpers shared with the screens: N/A answers don't count.
export const ctlScore = (list) => { const n = list.filter((c) => c.state !== 'N/A').length, y = list.filter((c) => c.state === 'In place').length; return { y, n, f: list.filter((c) => c.state === 'Planned').length }; };
export const cmpScore = (items) => { const n = items.filter((i) => i.a === 'Yes' || i.a === 'No').length, y = items.filter((i) => i.a === 'Yes').length; return { y, n, f: items.filter((i) => i.a === 'No').length }; };
export const pct = ({ y, n }) => (n ? `${y} / ${n} (${Math.round((y / n) * 100)}%)` : '–');
const STATE = { 'In place': 'Yes — in place', Planned: 'No — not in place', 'N/A': 'N/A' };

// m: { title, ref, client, site, siteAddress, description, people[], compliance[], hazards[{..., controls[], actions[]}], controls[] (general),
//      init_l..res_s, assessor, accompanied_by, assessment_date, review_date, status, versionLabel, summary, approved_by, approved_at,
//      approval_signature, actions[], acks[], audits[] }
export async function assessmentPDF(m) {
  try {
    const doc = newDoc(), lg = await logo();
    const hz = m.hazards || [], comp = m.compliance || [], gen = m.controls || [];
    const allCtl = hz.flatMap((h) => h.controls || []).concat(gen), cs = cmpScore(comp), ks = ctlScore(allCtl);
    const total = { y: cs.y + ks.y, n: cs.n + ks.n }, flagged = cs.f + ks.f, complete = !!m.approved_at;
    const tbl = (opts) => { doc.autoTable({ margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' }, ...opts }); return doc.lastAutoTable.finalY; };
    const sectionBar = (y, title, right) => tbl({ startY: y, head: [[{ content: title, styles: { halign: 'left' } }, { content: right || '', styles: { halign: 'right' } }]], body: [], columnStyles: { 1: { cellWidth: 60 } } });
    // header
    doc.addImage(lg, 'PNG', M, 10, 46, 11.8);
    doc.setFillColor(...(complete ? MINT : OR)); doc.roundedRect(W - M - 30, 11, 30, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.text(complete ? 'Complete' : 'Incomplete', W - M - 15, 16.3, { align: 'center' });
    doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(19);
    const tl = doc.splitTextToSize(m.title || 'General Risk Assessment', W - 2 * M); doc.text(tl, M, 33);
    let y = 33 + tl.length * 7.5;
    doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(`${fd(m.assessment_date)} / ${m.assessor || '—'}  ·  ${m.ref}  ·  ${m.versionLabel}`, M, y); y += 5;
    y = tbl({ startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 3, halign: 'center' }, headStyles: { fillColor: [239, 247, 245], textColor: INK },
      head: [['Score', 'Flagged items', 'Actions']], body: [[pct(total), String(flagged), String(m.actions.length)]] }) + 4;
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
      .concat(hz.flatMap((h) => (h.controls || []).filter((c) => c.state === 'Planned').map((c) => [h.title, c.title, 'Not in place'])), gen.filter((c) => c.state === 'Planned').map((c) => ['General controls', c.title, 'Not in place']));
    y = sectionBar(ensure(doc, y, 20), 'Flagged items', `${flags.length} flagged`);
    y = flags.length ? tbl({ startY: y, theme: 'plain', body: flags, columnStyles: { 0: { textColor: MUTE, cellWidth: 55 }, 2: { textColor: [215, 38, 30], cellWidth: 40 } } }) + 5 : tbl({ startY: y, theme: 'plain', body: [['Nothing flagged.']] }) + 5;
    // compliance
    if (comp.length) {
      y = sectionBar(ensure(doc, y, 20), 'Health and Safety Compliance Documents', `${cs.f} flagged, ${pct(cs)}`);
      y = tbl({ startY: y, theme: 'plain', body: comp.map((c) => [c.q + (c.note ? `\n${c.note}` : ''), c.a || '—']), columnStyles: { 1: { cellWidth: 30, fontStyle: 'bold' } },
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'No') d.cell.styles.textColor = [215, 38, 30]; } }) + 5;
    }
    // hazard sections
    for (const h of hz) {
      const ctl = h.controls || [], sc = ctlScore(ctl), rs = (h.risk_l || 0) * (h.risk_s || 0), acts = h.actions || [];
      y = sectionBar(ensure(doc, y, 30), h.title || 'Untitled hazard', pct(sc));
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
    }
    if (gen.length) {
      y = sectionBar(ensure(doc, y, 20), 'General controls', pct(ctlScore(gen)));
      y = tbl({ startY: y, theme: 'plain', body: gen.map((c) => [c.title + (c.description ? `\n${c.description}` : ''), STATE[c.state] || c.state]), columnStyles: { 1: { cellWidth: 62 } } }) + 5;
    }
    const other = m.actions.filter((x) => !x.assessment_hazard_id || !hz.some((h) => h.id === x.assessment_hazard_id));
    if (other.length) {
      y = sectionBar(ensure(doc, y, 20), 'Other actions', String(other.length));
      y = tbl({ startY: y, head: [['Action', 'Owner', 'Due', 'Priority', 'Status']], body: other.map((x) => [x.title || 'Untitled', x.owner || '—', fd(x.due_date), x.priority, x.status]), columnStyles: { 0: { cellWidth: 80 } } }) + 5;
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
    doc.addImage(lg, 'PNG', M, 10, 46, 11.8);
    doc.setFontSize(18); doc.setTextColor(...INK); doc.text(title, M, 34);
    doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(subtitle, M, 40);
    doc.text(`${acks.length} sign-off${acks.length === 1 ? '' : 's'}`, W - M, 40, { align: 'right' });
    if (!acks.length) { doc.setTextColor(...INK); doc.text('No sign-offs match.', M, 50); } else signTable(doc, 46, acks, true);
    footer(doc, 'Acknowledgement record');
    doc.save(`Acknowledgement-record-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) { console.error(e); toast('Could not create the PDF: ' + e.message, true); }
}
