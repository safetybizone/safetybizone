// PDF exports: risk assessment report (laid out like the printed sample) and sign-off records.
import { band, BANDCOL, LIK, SEV, fd, ft, COMPANY, toast } from './core.js';

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

function ratingBox(doc, x, y, w, label, L, S, dim) {
  const s = (L || 0) * (S || 0), b = band(s);
  doc.setDrawColor(...(dim ? [200, 205, 205] : INK)); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, 40, 3, 3);
  doc.setFillColor(...(dim ? [170, 178, 178] : TEAL)); doc.roundedRect(x + w / 2 - 22, y - 3, 44, 6, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255); doc.text(label, x + w / 2, y + 1, { align: 'center' });
  doc.setFillColor(...hex(BANDCOL[b.k])); doc.rect(x + 0.2, y + 4, w - 0.4, 9, 'F');
  doc.setFontSize(11); doc.setTextColor(...(b.k === 'vh' ? [255, 255, 255] : INK)); doc.text(b.n.toUpperCase(), x + w / 2, y + 10.2, { align: 'center' });
  doc.setFontSize(6.5); doc.setTextColor(...MUTE); doc.text('SEVERITY', x + w * 0.28, y + 18, { align: 'center' }); doc.text('LIKELIHOOD', x + w * 0.72, y + 18, { align: 'center' });
  doc.setFillColor(...(dim ? [170, 178, 178] : INK));
  doc.circle(x + w * 0.28, y + 23, 3.3, 'F'); doc.circle(x + w * 0.72, y + 23, 3.3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text(String(S || '–'), x + w * 0.28, y + 24.2, { align: 'center' }); doc.text(String(L || '–'), x + w * 0.72, y + 24.2, { align: 'center' });
  doc.setTextColor(...INK); doc.setFontSize(10); doc.text('×', x + w / 2, y + 24.3, { align: 'center' });
  doc.setFillColor(...(dim ? [170, 178, 178] : INK)); doc.circle(x + w / 2, y + 34, 5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.text(String(s || '–'), x + w / 2, y + 35.6, { align: 'center' });
}

function miniMatrix(doc, x, y, a) {
  const c = 7.2;
  doc.setFontSize(6); doc.setTextColor(...MUTE);
  for (let l = 5; l >= 1; l--) for (let s = 1; s <= 5; s++) {
    const v = l * s, cx = x + 6 + (s - 1) * c, cy = y + (5 - l) * c;
    doc.setFillColor(...hex(BANDCOL[band(v).k])); doc.rect(cx, cy, c - 0.6, c - 0.6, 'F');
    doc.setTextColor(...(band(v).k === 'vh' ? [255, 255, 255] : INK)); doc.text(String(v), cx + 1, cy + 2.6);
    const mark = (k, t) => { if (+a[k + '_l'] === l && +a[k + '_s'] === s) { doc.setFillColor(255, 255, 255); doc.circle(cx + c / 2 - 0.3, cy + c / 2 + 0.6, 2.2, 'F'); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(t, cx + c / 2 - 0.3, cy + c / 2 + 1.6, { align: 'center' }); doc.setFont('helvetica', 'normal'); } };
    mark('init', 'W'); mark('res', 'C');
  }
  doc.setTextColor(...MUTE); doc.setFontSize(6);
  for (let l = 1; l <= 5; l++) doc.text(String(l), x + 3, y + (5 - l) * c + 4.4, { align: 'center' });
  for (let s = 1; s <= 5; s++) doc.text(String(s), x + 6 + (s - 1) * c + c / 2 - 0.3, y + 5 * c + 3, { align: 'center' });
  doc.text('Likelihood (up) x severity (across)', x + 6, y + 5 * c + 7);
  doc.text('W = without controls   C = with controls', x + 6, y + 5 * c + 10.5);
}

// m: { title, ref, client, site, description, people[], hazards[], controls[], init_l..res_s, assessor, assessment_date,
//      review_date, status, versionLabel, actions[], acks[], audits[] }
export async function assessmentPDF(m) {
  try {
    const doc = newDoc(), lg = await logo();
    doc.addImage(lg, 'PNG', M, 10, 46, 11.8);
    // left column
    let y = 32; const LW = 128;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.setFontSize(20);
    const tl = doc.splitTextToSize(m.title || 'Untitled risk assessment', LW); doc.text(tl, M, y); y += tl.length * 8;
    doc.setFontSize(9); doc.text(`${m.client}${m.site ? ' · ' + m.site : ''}`, M, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text(m.versionLabel, M, y); doc.setFont('helvetica', 'normal'); y += 7;
    if (m.description) { doc.setFontSize(9); doc.setTextColor(...INK); const d = doc.splitTextToSize(m.description, LW); doc.text(d, M, y, { lineHeightFactor: 1.45 }); y += d.length * 4.6 + 4; }
    // right column ratings
    const rx = 150, rw = 46;
    ratingBox(doc, rx, 14, rw, 'WITH CONTROLS', m.res_l, m.res_s, false);
    const i = (m.init_l || 0) * (m.init_s || 0), r = (m.res_l || 0) * (m.res_s || 0), red = i && r ? Math.round(((i - r) / i) * 100) : null;
    doc.setDrawColor(...INK); doc.roundedRect(rx, 59, rw, 11, 5, 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...INK); doc.text(['RISK RATING', 'REDUCTION'], rx + 4, 63.6);
    doc.setFontSize(13); doc.setTextColor(...(red != null && red > 0 ? MINT : INK)); doc.text(red == null ? '–' : `${red}%`, rx + rw - 4, 66.8, { align: 'right' });
    if (red != null && red > 0) { const ax = rx + rw - 6 - doc.getTextWidth(`${red}%`); doc.setDrawColor(...MINT); doc.setLineWidth(0.6); doc.line(ax, 62, ax, 66.6); doc.line(ax - 1.4, 65.2, ax, 66.6); doc.line(ax + 1.4, 65.2, ax, 66.6); doc.setLineWidth(0.2); }
    ratingBox(doc, rx, 77, rw, 'WITHOUT CONTROLS', m.init_l, m.init_s, true);
    y = Math.max(y, 30);
    // people exposed
    y = section(doc, y + 2, 'People exposed');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
    const ppl = m.people.length ? m.people : ['Not specified'];
    ppl.forEach((p, k) => { const col = k % 2, yy = y + Math.floor(k / 2) * 6; doc.setDrawColor(...INK); doc.circle(M + 3 + col * 62, yy - 1.2, 1.4); doc.text(p, M + 7 + col * 62, yy); });
    y += Math.ceil(ppl.length / 2) * 6 + 4;
    // hazards
    y = section(doc, Math.max(y, 0), 'Hazards');
    const HW = 120;
    if (!m.hazards.length) { doc.setFontSize(9); doc.text('No hazards recorded.', M + 7, y); y += 6; }
    for (const h of m.hazards) {
      const d = h.description ? doc.splitTextToSize(h.description, y < 120 ? HW : 175) : [];
      y = ensure(doc, y, 6 + d.length * 4.2);
      doc.setFillColor(...INK); doc.triangle(M + 2.6, y - 3.2, M + 0.6, y + 0.2, M + 4.6, y + 0.2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(h.title || 'Untitled hazard', M + 7, y);
      doc.setFont('helvetica', 'normal'); if (d.length) doc.text(d, M + 7, y + 4.4, { lineHeightFactor: 1.4 });
      y += 6.5 + d.length * 4.2;
    }
    // controls
    y = ensure(doc, y + 2, 20); y = section(doc, y, 'Control measures');
    if (!m.controls.length) { doc.setFontSize(9); doc.text('No control measures recorded.', M + 7, y); y += 6; }
    for (const c of m.controls) {
      const d = c.description ? doc.splitTextToSize(c.description, 175) : [];
      y = ensure(doc, y, 6 + d.length * 4.2);
      doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.circle(M + 2.6, y - 1.2, 1.7);
      if (c.state === 'In place') { doc.setFillColor(...MINT); doc.circle(M + 2.6, y - 1.2, 0.9, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(c.title || 'Untitled control', M + 7, y);
      const tw = doc.getTextWidth(c.title || 'Untitled control');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...(c.state === 'Planned' ? OR : MUTE));
      doc.text(`${c.type}${c.state === 'Planned' ? ' · PLANNED' : ''}`, M + 9 + tw, y);
      doc.setFontSize(9); doc.setTextColor(...INK); if (d.length) doc.text(d, M + 7, y + 4.4, { lineHeightFactor: 1.4 });
      y += 6.5 + d.length * 4.2;
    }
    // matrix + details
    y = ensure(doc, y + 2, 62); y = section(doc, y, 'Risk matrix and details');
    miniMatrix(doc, M, y, m);
    const det = [['Reference', m.ref], ['Client', m.client], ['Site', m.site || '—'], ['Assessor', m.assessor || '—'], ['Assessment date', fd(m.assessment_date)], ['Renewal date', fd(m.review_date)], ['Status', m.status], ['Version', m.versionLabel]];
    doc.setFontSize(8.5);
    det.forEach(([k, v], j) => { doc.setTextColor(...MUTE); doc.text(k, 70, y + 3 + j * 5.4); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(String(v ?? '—'), 90)[0], 108, y + 3 + j * 5.4); });
    y += 52;
    // actions
    if (m.actions.length) {
      y = ensure(doc, y + 2, 24); y = section(doc, y, 'Actions');
      doc.autoTable({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.8, textColor: INK }, headStyles: { fillColor: TEAL, textColor: 255 },
        head: [['Action', 'Owner', 'Due', 'Priority', 'Status']],
        body: m.actions.map((x) => [x.title || 'Untitled', x.owner || '—', fd(x.due_date), x.priority, x.status + (x.status === 'Done' && x.completed_on ? ` (${fd(x.completed_on)})` : '')]),
        columnStyles: { 0: { cellWidth: 80 } } });
      y = doc.lastAutoTable.finalY + 6;
    }
    if (m.audits && m.audits.length) {
      y = ensure(doc, y + 2, 24); y = section(doc, y, 'Audits');
      doc.autoTable({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.8, textColor: INK }, headStyles: { fillColor: TEAL, textColor: 255 },
        head: [['Date', 'Auditor', 'Score', 'Outcome', 'Summary']], body: m.audits.map((u) => [fd(u.audit_date), u.auditor || '—', u.score + '%', u.outcome, u.summary || '']), columnStyles: { 4: { cellWidth: 80 } } });
      y = doc.lastAutoTable.finalY + 6;
    }
    // sign-offs
    y = ensure(doc, y + 2, 30); y = section(doc, y, 'Acknowledgement record');
    if (!m.acks.length) { doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text('No sign-offs recorded yet.', M, y); }
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
