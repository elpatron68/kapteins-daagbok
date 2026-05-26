# Features Research

**Domain:** Maritime Ship's Logbook PWA
**Researched:** 2026-05-26
**Confidence:** HIGH

## Feature Categories

### 1. Vessel & Crew Master Data (Stammdaten)
- **Vessel Profile**: Capture Yachtname, Heimathafen, Charterfirma, Eigner, Kennzeichen/Zulassungsnummer, Funk-Rufzeichen, ATIS-Nr, MMSI-Nr.
- **Crew Registry**: Skipper and crew profiles (up to 6 members) with Name, Anschrift, Geburtstag, Tel-Nr, Nationalität, Pass-Nr, Blutgruppe, Allergien, Krankheiten.
- **Deviation Table (Steuertafel)**: Standard magnetic compass deviation table mapping Compass Heading (MgK) from 000° to 360° (in 10° increments) to Deviation (Ablenkung).

### 2. Journey Logbook (Logbucheintrag)
- **General Journey Info**: Date, Day of Travel (. Reisetag), Departure (Reise von) & Destination (nach).
- **Hourly/Event Entry**: Time, Compass Course (MgK), Chart Course (rwK/KüG), Wind (pressure hPa, direction, strength), Sea State (Seegang), Weather (icons/symbols), Current (Strom), Heel (Lage), Sail Configuration (G, F, S, StF) or Motor run hours, Log reading, Distance, and GPS Coordinate with custom remarks.
- **Daily Summaries**: Position morning & evening, freshwater/fuel stock checks (morning stock, refilled, evening stock, daily consumption).
- **Sign-off**: Signatures of Skipper and Crew (names in block letters + signature).

### 3. Smart Integrations (Assistance)
- **OpenWeatherMap Integration**: Automatically query and pre-fill wind direction/strength, pressure, and weather state based on geographical coordinates.
- **GPS Coordinates Capture**: Fetch current latitude/longitude via device GPS and pre-fill coordinates into log entries.

### 4. Data Management & Privacy
- **Local Database (IndexedDB)**: Direct database queries and local storage in browser sandbox.
- **CSV Data Export**: Generate and download formatted CSV logbooks directly, or trigger local email/message sharing.
- **Offline Assets & Service Worker**: Cache all HTML, JS, CSS, and assets so the application runs completely disconnected.

## Feature Scoping: Table Stakes vs Differentiators

| Feature | Category | Type | Complexity | Notes |
|---------|----------|------|------------|-------|
| Vessel Profile | Stammdaten | Table Stake | Low | Form entry with validation. |
| Crew Registry | Stammdaten | Table Stake | Low | Up to 6 profiles, standard fields. |
| Logbook Form | Logbuch | Table Stake | Medium | Complex form containing wind, course, and sails. |
| Deviation Table | Stammdaten | Table Stake | Low | Grid mapping MgK to Abl. |
| CSV Export | Data | Table Stake | Medium | Client-side CSV generation and download trigger. |
| Local Storage | Data | Table Stake | Medium | IndexedDB schema setup and migration. |
| Offline PWA | System | Table Stake | Medium | Service Worker configuration. |
| GPS Fetching | Assistance | Differentiator | Low | HTML5 Geolocation API integration. |
| OpenWeather API | Assistance | Differentiator | Medium | Needs API key, coordinates, and fallback for offline. |
| Adaptive OS UI | UI/UX | Differentiator | High | Modifying UI based on UserAgent/OS detection. |

## Anti-Features (Do Not Build)

- **Cloud DB Sync**: Violates local-only privacy constraint.
- **Central User Login / Registration**: No remote accounts; the app is immediately active upon loading.
- **Remote Sharing Server**: Logbook files must be exported directly from the device (CSV download or local email handler).

## Dependencies & Risk Analysis

1. **Weather API Dependency**: OpenWeatherMap API requires internet access. If the user is offline (common at sea), the API will fail. 
   - *Risk Mitigation*: Implement clean offline fallback. Inform the user they are offline and allow manual weather entry.
2. **GPS Geolocation Dependency**: Requires browser permissions. Device GPS can be slow to lock or unavailable on some tablets without GPS chips.
   - *Risk Mitigation*: Allow manual entry of latitude and longitude as fallback.
3. **PWA Storage Cleared by OS**: iOS Safari sometimes purges IndexedDB for apps not added to the home screen if they are unused for 7+ days.
   - *Risk Mitigation*: Display a warning prompting the user to install the app to the home screen (PWA installation protects storage) and encourage regular backups using the CSV export.

---
*Features research for: Kapteins Daagbox PWA*
*Researched: 2026-05-26*
