import { jsPDF } from 'jspdf'
import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson } from './crypto.js'
import { isSignatureImage } from '../utils/signatures.js'

export async function generateLogbookPagePdf(logbookId: string, entryId: string, preloadedData?: { yacht: any; entry: any }): Promise<jsPDF> {
  let yachtName = '', homePort = '', registration = '', callsign = '', atis = '', mmsi = '';
  let entry: any = null;

  if (preloadedData) {
    const yacht = preloadedData.yacht || {};
    yachtName = yacht.name || '';
    homePort = yacht.port || '';
    registration = yacht.registrationNumber || yacht.registration || '';
    callsign = yacht.callSign || '';
    atis = yacht.atis || '';
    mmsi = yacht.mmsi || '';
    entry = preloadedData.entry;
  } else {
    const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
    if (!masterKey) {
      throw new Error('Encryption key not found. Please log in.')
    }

    // 1. Fetch Yacht details
    const yachtRecord = await db.yachts.get(logbookId);
    if (yachtRecord) {
      try {
        const yacht = await decryptJson(yachtRecord.encryptedData, yachtRecord.iv, yachtRecord.tag, masterKey);
        yachtName = yacht.name || '';
        homePort = yacht.port || '';
        registration = yacht.registrationNumber || yacht.registration || '';
        callsign = yacht.callSign || '';
        atis = yacht.atis || '';
        mmsi = yacht.mmsi || '';
      } catch (e) {
        console.error('Failed to decrypt yacht details for PDF:', e);
      }
    }

    // 2. Fetch active Entry
    const entryRecord = await db.entries.get(entryId);
    if (!entryRecord) {
      throw new Error('Entry not found');
    }

    entry = await decryptJson(entryRecord.encryptedData, entryRecord.iv, entryRecord.tag, masterKey);
  }

  if (!entry) {
    throw new Error('Failed to load entry');
  }


  // Create PDF landscape A4
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Setup Styles
  doc.setFont('Helvetica', 'normal');

  // --- DRAW HEADER SECTION ---
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.text('OFFIZIELLES SCHIFFSLOGBUCH (AC NAUTIK STANDARD)', 10, 15);

  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Yachtname: ${yachtName || '—'}`, 10, 21);
  doc.text(`Heimathafen: ${homePort || '—'}`, 60, 21);
  doc.text(`Kennzeichen: ${registration || '—'}`, 110, 21);
  doc.text(`Rufzeichen: ${callsign || '—'}`, 160, 21);
  doc.text(`ATIS: ${atis || '—'}`, 210, 21);
  doc.text(`MMSI: ${mmsi || '—'}`, 250, 21);

  doc.text(`Datum: ${entry.date || '—'}`, 10, 23);
  doc.text(`Reisetag: ${entry.dayOfTravel || '—'}`, 60, 23);
  doc.text(`Reise von (Departure): ${entry.departure || '—'}`, 110, 23);
  doc.text(`nach (Destination): ${entry.destination || '—'}`, 200, 23);

  if (entry.trackDistanceNm) {
    doc.setFont('Helvetica', 'normal');
    doc.text(
      `GPS-Track: ${entry.trackDistanceNm} sm · max. ${entry.trackSpeedMaxKn ?? '—'} kn · Ø ${entry.trackSpeedAvgKn ?? '—'} kn`,
      10,
      27
    );
  }

  // Divider line
  doc.setLineWidth(0.3);
  doc.line(10, 29, 287, 29);

  // --- DRAW EVENTS TABLE ---
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CHRONOLOGISCHES EREIGNISPROTOKOLL / EVENT JOURNAL', 10, 34);

  // Table Headers
  const colWidths = [12, 10, 10, 12, 12, 13, 10, 12, 10, 15, 12, 45, 94]; // Total = 277mm
  const colHeaders = [
    'Zeit', 'MgK', 'rwK', 'Wind Dir', 'Wind Str', 'Druck', 'See', 
    'Strom', 'Lage', 'Segel/Motor', 'Log', 'GPS Position', 'Bemerkungen / Vorkommnisse'
  ];

  let startY = 37;
  let rowHeight = 6;
  doc.setFontSize(7.5);

  // Draw Header Row
  let currentX = 10;
  doc.setFillColor(240, 240, 240);
  doc.rect(10, startY, 277, rowHeight, 'F');
  doc.rect(10, startY, 277, rowHeight, 'S');

  for (let i = 0; i < colHeaders.length; i++) {
    doc.text(colHeaders[i], currentX + 1, startY + 4.2);
    currentX += colWidths[i];
  }

  // Draw Data Rows
  const events = entry.events || [];
  const maxRows = 16;
  const sortedEvents = [...events].sort((a: any, b: any) => (a.time || '').localeCompare(b.time || ''));

  doc.setFont('Helvetica', 'normal');

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const y = startY + rowHeight + (rowIndex * rowHeight);
    
    // Draw row outline
    doc.rect(10, y, 277, rowHeight, 'S');

    // Draw vertical column cell dividers
    let cellX = 10;
    for (let colIdx = 0; colIdx < colWidths.length - 1; colIdx++) {
      cellX += colWidths[colIdx];
      doc.line(cellX, y, cellX, y + rowHeight);
    }

    const ev = sortedEvents[rowIndex];
    if (ev) {
      let writeX = 10;
      doc.text(ev.time || '', writeX + 1, y + 4.2);
      writeX += colWidths[0];
      doc.text(ev.mgk ? `${ev.mgk}°` : '—', writeX + 1, y + 4.2);
      writeX += colWidths[1];
      doc.text(ev.rwk ? `${ev.rwk}°` : '—', writeX + 1, y + 4.2);
      writeX += colWidths[2];
      doc.text(ev.windDirection || '—', writeX + 1, y + 4.2);
      writeX += colWidths[3];
      doc.text(ev.windStrength || '—', writeX + 1, y + 4.2);
      writeX += colWidths[4];
      doc.text(ev.windPressure ? `${ev.windPressure} hPa` : '—', writeX + 1, y + 4.2);
      writeX += colWidths[5];
      doc.text(ev.seaState || '—', writeX + 1, y + 4.2);
      writeX += colWidths[6];
      doc.text(ev.current || '—', writeX + 1, y + 4.2);
      writeX += colWidths[7];
      doc.text(ev.heel ? `${ev.heel}°` : '—', writeX + 1, y + 4.2);
      writeX += colWidths[8];
      doc.text(ev.sailsOrMotor || '—', writeX + 1, y + 4.2);
      writeX += colWidths[9];
      doc.text(ev.logReading ? `${ev.logReading} sm` : '—', writeX + 1, y + 4.2);
      writeX += colWidths[10];

      const gps = ev.gpsLat && ev.gpsLng ? `${ev.gpsLat}, ${ev.gpsLng}` : '—';
      doc.text(gps, writeX + 1, y + 4.2);
      writeX += colWidths[11];

      // Clip remarks to fit within the 94mm bounds
      const remarks = ev.remarks || '';
      const maxChars = 65;
      const clippedRemarks = remarks.length > maxChars ? remarks.substring(0, maxChars) + '...' : remarks;
      doc.text(clippedRemarks, writeX + 1, y + 4.2);
    }
  }

  // --- DRAW FOOTER SECTION ---
  const footerY = startY + rowHeight + (maxRows * rowHeight) + 4;

  // Consumables (Water & Diesel)
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VERBRAUCHSWERTE / CONSUMPTON STATS', 10, footerY + 3);

  let fwY = footerY + 5;
  doc.rect(10, fwY, 110, rowHeight * 3, 'S');
  doc.line(10, fwY + rowHeight, 120, fwY + rowHeight);
  doc.line(10, fwY + rowHeight * 2, 120, fwY + rowHeight * 2);
  doc.line(40, fwY, 40, fwY + rowHeight * 3);
  doc.line(60, fwY, 60, fwY + rowHeight * 3);
  doc.line(80, fwY, 80, fwY + rowHeight * 3);
  doc.line(100, fwY, 100, fwY + rowHeight * 3);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Betriebsmittel', 11, fwY + 4.2);
  doc.text('Morgen (L)', 41, fwY + 4.2);
  doc.text('Nachgefüllt', 61, fwY + 4.2);
  doc.text('Abend (L)', 81, fwY + 4.2);
  doc.text('Verbrauch', 101, fwY + 4.2);

  doc.setFont('Helvetica', 'normal');
  doc.text('Frischwasser', 11, fwY + rowHeight + 4.2);
  doc.text(String(entry.freshwater?.morning ?? '0'), 41, fwY + rowHeight + 4.2);
  doc.text(String(entry.freshwater?.refilled ?? '0'), 61, fwY + rowHeight + 4.2);
  doc.text(String(entry.freshwater?.evening ?? '0'), 81, fwY + rowHeight + 4.2);
  doc.text(String(entry.freshwater?.consumption ?? '0'), 101, fwY + rowHeight + 4.2);

  doc.text('Treibstoff (Fuel)', 11, fwY + rowHeight * 2 + 4.2);
  doc.text(String(entry.fuel?.morning ?? '0'), 41, fwY + rowHeight * 2 + 4.2);
  doc.text(String(entry.fuel?.refilled ?? '0'), 61, fwY + rowHeight * 2 + 4.2);
  doc.text(String(entry.fuel?.evening ?? '0'), 81, fwY + rowHeight * 2 + 4.2);
  doc.text(String(entry.fuel?.consumption ?? '0'), 101, fwY + rowHeight * 2 + 4.2);

  // Signatures Box
  let sigX = 130;
  let sigY = footerY + 5;
  doc.setFont('Helvetica', 'bold');
  doc.text('FREIGABE & UNTERSCHRIFTEN / SIGNATURES', sigX, footerY + 3);

  doc.rect(sigX, sigY, 157, rowHeight * 3, 'S');
  doc.line(sigX, sigY + rowHeight * 1.5, sigX + 157, sigY + rowHeight * 1.5);
  doc.line(sigX + 78.5, sigY, sigX + 78.5, sigY + rowHeight * 3);

  doc.text('Skipper Unterschrift:', sigX + 2, sigY + 4.2);
  if (isSignatureImage(entry.signSkipper)) {
    doc.addImage(entry.signSkipper, 'PNG', sigX + 2, sigY + 6, 72, 14)
  } else {
    doc.setFont('Helvetica', 'normal');
    doc.text(String(entry.signSkipper || '—').toUpperCase(), sigX + 2, sigY + 11.2);
  }

  doc.setFont('Helvetica', 'bold');
  doc.text('Crew Unterschrift:', sigX + 80.5, sigY + 4.2);
  if (isSignatureImage(entry.signCrew)) {
    doc.addImage(entry.signCrew, 'PNG', sigX + 80.5, sigY + 6, 72, 14)
  } else {
    doc.setFont('Helvetica', 'normal');
    doc.text(String(entry.signCrew || '—').toUpperCase(), sigX + 80.5, sigY + 11.2);
  }

  return doc;
}

export async function downloadLogbookPagePdf(logbookId: string, entryId: string, dateStr: string, preloadedData?: { yacht: any; entry: any }): Promise<void> {
  const doc = await generateLogbookPagePdf(logbookId, entryId, preloadedData);
  const filename = `logbook_${dateStr.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  doc.save(filename);
}
