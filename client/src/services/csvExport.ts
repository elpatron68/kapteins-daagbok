import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson } from './crypto.js'
import { formatSignatureForExport, normalizeSignature } from '../utils/signatures.js'
import { sortLogEventsByTime } from '../utils/logEntryPayload.js'
import i18n from '../i18n/index.js'
import { formatAppDateTime } from '../utils/dateTimeFormat.js'

function escapeCsvValue(val: string | number | undefined | null): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportLogbookToCsv(logbookId: string, preloadedData?: { yacht: any; entries: any[] }): Promise<string> {
  let yachtName = '', homePort = '', owner = '', charter = '', registration = '', callsign = '', atis = '', mmsi = '';
  let decryptedEntries: any[] = [];

  if (preloadedData) {
    const yacht = preloadedData.yacht || {};
    yachtName = yacht.name || '';
    homePort = yacht.port || '';
    owner = yacht.owner || '';
    charter = yacht.charter || '';
    registration = yacht.registration || '';
    callsign = yacht.callsign || '';
    atis = yacht.atis || '';
    mmsi = yacht.mmsi || '';
    decryptedEntries = [...preloadedData.entries];
  } else {
    const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
    if (!masterKey) {
      throw new Error('Encryption key not found. User must log in.')
    }

    // 1. Fetch Yacht details
    const yachtRecord = await db.yachts.get(logbookId);
    if (yachtRecord) {
      try {
        const yacht = await decryptJson(yachtRecord.encryptedData, yachtRecord.iv, yachtRecord.tag, masterKey);
        yachtName = yacht.name || '';
        homePort = yacht.port || '';
        owner = yacht.owner || '';
        charter = yacht.charter || '';
        registration = yacht.registration || '';
        callsign = yacht.callsign || '';
        atis = yacht.atis || '';
        mmsi = yacht.mmsi || '';
      } catch (e) {
        console.error('Failed to decrypt yacht details for CSV:', e);
      }
    }

    // 2. Fetch logbook entries
    const localEntries = await db.entries.where({ logbookId }).toArray();
    for (const entry of localEntries) {
      try {
        const dec = await decryptJson(entry.encryptedData, entry.iv, entry.tag, masterKey);
        if (dec) {
          decryptedEntries.push(dec);
        }
      } catch (e) {
        console.error('Failed to decrypt entry for CSV:', e);
      }
    }
  }

  // Sort chronological ascending (by date, and then dayOfTravel numerical)
  decryptedEntries.sort((a, b) => {
    const timeA = new Date(a.date || '').getTime() || 0;
    const timeB = new Date(b.date || '').getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return Number(a.dayOfTravel || 0) - Number(b.dayOfTravel || 0);
  });

  // Headers matching the requested event fields & metadata
  const headers = [
    'Date', 'Day of Travel', 'Departure Port', 'Destination Port',
    'Skipper Signature', 'Crew Signature',
    'Track Distance (nm)', 'Track Max Speed (kn)', 'Track Avg Speed (kn)', 'Motor Hours (h)',
    'Event Time', 'MgK Course', 'RwK Course',
    'Wind Dir', 'Wind Str', 'Barometer (hPa)', 'Sea State',
    'Current', 'Heel Angle', 'Sails/Motor', 'Log (nm)', 'Distance (nm)',
    'Latitude', 'Longitude', 'Remarks',
    'Freshwater Morning (L)', 'Freshwater Refilled (L)', 'Freshwater Evening (L)', 'Freshwater Consumption (L)',
    'Fuel Morning (L)', 'Fuel Refilled (L)', 'Fuel Evening (L)', 'Fuel Consumption (L)',
    'Yacht Name', 'Home Port', 'Owner', 'Charter Company', 'Registration', 'Callsign', 'ATIS', 'MMSI'
  ];

  const rows: string[][] = [headers];
  const exportLabels = {
    imagePlaceholder: i18n.t('logs.sign_export_image'),
    passkeyLabel: (username: string, signedAt: string) => {
      const date = formatAppDateTime(signedAt, i18n.language)
      return i18n.t('logs.sign_passkey_export', { username, date })
    },
    attributionLabel: (username: string, signedAt: string) => {
      const date = formatAppDateTime(signedAt, i18n.language)
      return i18n.t('logs.sign_attribution_export', { username, date })
    }
  };

  for (const entry of decryptedEntries) {
    const dateVal = entry.date || '';
    const travelDay = entry.dayOfTravel || '';
    const dep = entry.departure || '';
    const dest = entry.destination || '';
    const signS = formatSignatureForExport(normalizeSignature(entry.signSkipper), exportLabels);
    const signC = formatSignatureForExport(normalizeSignature(entry.signCrew), exportLabels);
    const trackDist = entry.trackDistanceNm ?? '';
    const trackMax = entry.trackSpeedMaxKn ?? '';
    const trackAvg = entry.trackSpeedAvgKn ?? '';
    const motorH = entry.motorHours ?? '';
    const fwM = entry.freshwater?.morning ?? '';
    const fwR = entry.freshwater?.refilled ?? '';
    const fwE = entry.freshwater?.evening ?? '';
    const fwCons = entry.freshwater?.consumption ?? '';
    const fuelM = entry.fuel?.morning ?? '';
    const fuelR = entry.fuel?.refilled ?? '';
    const fuelE = entry.fuel?.evening ?? '';
    const fuelCons = entry.fuel?.consumption ?? '';

    const eventsList = entry.events || [];
    if (eventsList.length === 0) {
      // Create one row even if there are no events for the day
      rows.push([
        dateVal, travelDay, dep, dest,
        signS, signC,
        trackDist, trackMax, trackAvg, motorH,
        '', '', '',
        '', '', '', '',
        '', '', '', '', '',
        '', '', '',
        fwM, fwR, fwE, fwCons,
        fuelM, fuelR, fuelE, fuelCons,
        yachtName, homePort, owner, charter, registration, callsign, atis, mmsi
      ].map(escapeCsvValue));
    } else {
      // Sort events chronologically by time
      const sortedEvents = sortLogEventsByTime(eventsList);
      for (const ev of sortedEvents) {
        rows.push([
          dateVal, travelDay, dep, dest,
          signS, signC,
          trackDist, trackMax, trackAvg, motorH,
          ev.time || '', ev.mgk || '', ev.rwk || '',
          ev.windDirection || '', ev.windStrength || '', ev.windPressure || '', ev.seaState || '',
          ev.current || '', ev.heel || '', ev.sailsOrMotor || '', ev.logReading || '', ev.distance || '',
          ev.gpsLat || '', ev.gpsLng || '', ev.remarks || '',
          fwM, fwR, fwE, fwCons,
          fuelM, fuelR, fuelE, fuelCons,
          yachtName, homePort, owner, charter, registration, callsign, atis, mmsi
        ].map(escapeCsvValue));
      }
    }
  }

  // Convert array of arrays to CSV string
  return rows.map(r => r.join(',')).join('\n');
}

export async function downloadCsv(logbookId: string, title: string, preloadedData?: { yacht: any; entries: any[] }): Promise<void> {
  const csvContent = await exportLogbookToCsv(logbookId, preloadedData);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Sanitize filename
  const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_logbook.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function shareCsv(logbookId: string, title: string, preloadedData?: { yacht: any; entries: any[] }): Promise<void> {
  const csvContent = await exportLogbookToCsv(logbookId, preloadedData);
  const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_logbook.csv`;
  
  const file = new File([csvContent], filename, { type: 'text/csv' });
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Kapteins Daagbok - ${title}`,
        text: `Logbook export for yacht ${title}`
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Sharing failed, falling back to download:', e);
        await downloadCsv(logbookId, title, preloadedData);
      }
    }
  } else {
    throw new Error('share_unsupported');
  }
}
