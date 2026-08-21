// Dependency-free document exports used for agreement records and archives.
function pdfEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/[()]/g, '\\$&').replace(/[\r\n]+/g, ' '); }
function wrap(value, width = 92) { const words = String(value || '').split(/\s+/); const lines = []; let line = ''; for (const word of words) { if ((line + ' ' + word).trim().length > width) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) lines.push(line); return lines; }
function agreementPdf(agreement, parties = [], audit = []) {
  const lines = [
    'SKILLBRIDGE AGREEMENT RECORD', `Agreement Number: ${agreement.agreement_number || agreement.id}`, `Title: ${agreement.title || ''}`,
    `Type: ${agreement.agreement_type || ''}`, `Status: ${agreement.status || ''}`, `Price: NGN ${Number(agreement.price || 0).toLocaleString()}`,
    `Timeline: ${agreement.timeline || 'Not specified'}`, '', 'Scope and deliverables:', ...wrap(agreement.details?.scope || ''), '', 'Terms and conditions:', ...wrap(agreement.details?.terms || ''), '', 'Required parties:', ...parties.map(p => `${p.party_name} (${p.party_role}) — ${p.accepted_at ? `accepted ${new Date(p.accepted_at).toISOString()}` : p.declined_at ? 'declined' : 'pending'}`), '', 'Audit history:', ...audit.map(a => `${new Date(a.created_at).toISOString()} — ${a.action}${a.note ? `: ${a.note}` : ''}`)
  ];
  const stream = ['BT','/F1 10 Tf','50 790 Td']; let y = 790;
  for (const raw of lines.slice(0, 65)) { if (y < 45) break; stream.push(`(${pdfEscape(raw)}) Tj`, '0 -12 Td'); y -= 12; }
  stream.push('ET'); const content = stream.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let output = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${obj}\nendobj\n`; }); const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}
function crc32(buffer) { let crc = ~0; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); } return (~crc) >>> 0; }
function zip(files) {
  const chunks = [], central = []; let offset = 0;
  for (const file of files) { const name = Buffer.from(file.name); const data = Buffer.from(file.data); const crc = crc32(data); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0,6); local.writeUInt16LE(0,8); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(name.length,26); local.writeUInt16LE(0,28); chunks.push(local,name,data); const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50,0); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt16LE(0,8); entry.writeUInt16LE(0,10); entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42); central.push(entry,name); offset += local.length + name.length + data.length; }
  const centralSize = central.reduce((n,b) => n + b.length, 0); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(centralSize,12); end.writeUInt32LE(offset,16); return Buffer.concat([...chunks,...central,end]);
}
module.exports = { agreementPdf, zip };
