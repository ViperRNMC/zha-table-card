[![GitHub Release](https://img.shields.io/github/v/release/ViperRNMC/zha-table-card)](https://github.com/ViperRNMC/zha-table-card/releases)
[![GitHub Issues](https://img.shields.io/github/issues/ViperRNMC/zha-table-card)](https://github.com/ViperRNMC/zha-table-card/issues)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

# ZHA Table Card

Een gebruiksvriendelijke tabelweergave voor ZHA (Zigbee Home Assistant) apparaten. Deze fork breidt de originele `zha-network-card` en `zha-network-card-ext`uit met extra functies voor overzicht en beheer van  Zigbee-netwerken.

## Belangrijkste features

- Filteren op area, model, apparaat-type, online-status en naam
- Filters en sortering blijven behouden tussen pagina-herladingen (sessionStorage)
- Export naar CSV
- Samengevoegde `quirk`-kolom: toont een icoon met tooltip en optionele tekst; ondersteunt ook de oude attributen `quirk_class` en `quirk_applied`
- Offline-first sortering (configuratie-optie)
- Klikbare rijen die naar de device-pagina navigeren

## Installatie

1. Plaats `zha-table-card.js` in de `www/` map van je Home Assistant installatie (of een andere statische resource-locatie).
2. Voeg de resource toe aan Lovelace (Resources):

```yaml
- url: /local/zha-table-card.js
  type: module
```

3. Herlaad de frontend of clear de cache als je de kaart meteen wilt testen.

> Tip: maak altijd een backup van je bestaande `zha-table-card.js` in `www/` voordat je overschrijft.

## Directe installatie (snelle links)

Je kunt het bestand snel downloaden of kopiëren met de volgende voorbeelden. Pas het pad aan wanneer je een andere locatie gebruikt.

- Raw GitHub URL (gebruik deze om direct te linken of in je resource op GitHub raw):

  https://raw.githubusercontent.com/ViperRNMC/zha-table-card/main/dist/zha-table-card.js

- Download met curl (voeg `-L` toe om redirects te volgen):

```bash
curl -L -o /path/to/www/community/zha-table-card/zha-table-card.js \
  https://raw.githubusercontent.com/ViperRNMC/zha-table-card/main/dist/zha-table-card.js
```

- Download met wget:

```bash
wget -O /path/to/www/community/zha-table-card/zha-table-card.js \
  https://raw.githubusercontent.com/ViperRNMC/zha-table-card/main/dist/zha-table-card.js
```

- Kopieer lokaal (als je repository op dezelfde machine staat):

```bash
cp -v /Users/viper/github/zha-table-card/dist/zha-table-card.js /path/to/www/community/zha-table-card/zha-table-card.js
```

- Backup-voorbeeld (maak timestamped backup voordat je overschrijft):

```bash
ts=$(date +%Y%m%d-%H%M%S)
cp /path/to/www/community/zha-table-card/zha-table-card.js /path/to/www/community/zha-table-card/zha-table-card.js.bak.$ts
```

Opmerking: vervang `/path/to/www/community/zha-table-card/` door je daadwerkelijke Home Assistant `www` pad, bijvoorbeeld `/volumes/config/www/community/zha-table-card/` of `/Users/viper/hass-dev/config/www/community/zha-table-card/`.

## Configuratie (GUI en YAML)

De kaart exposeert een Lovelace editor (GUI) waarmee je kolommen kunt aan- of uitzetten, herschikken en configureren. YAML is optioneel — je kunt snel via de editor je zichtbare kolommen en opties instellen.

Als je liever handmatig YAML gebruikt, blijft dat natuurlijk mogelijk en de kaart ondersteunt beide werkwijzen.

## Quirk-kolom

De kaart gebruikt één samengevoegde `quirk`-kolom. Mogelijke vormen:

- nieuw: `quirk` kan een object zijn: `{ class, applied }`
- oud: losse attributen `quirk_class` (naam) en `quirk_applied` (boolean)

We tonen een klein icoon (mdi:bug) met een tooltip die de quirk-naam en status (applied / not applied) toont. Indien beschikbaar wordt naast het icoon ook de quirk-naam getoond in gedempte tekst.

## Debug helper

Roep in de browser-console aan (wanneer `hass` beschikbaar is):

```js
window.zha_table_card_debug(window.hass || window._zha_card_hass)
```

Dit geeft een kort overzicht van ZHA-devices en mogelijke overeenkomende sensor-entity_ids (handig bij het bepalen van fallbacks).

## Veelgebruikte attributen

De kaart kan direct waarden uit de ZHA device attributes tonen. De meest voorkomende attributen die worden gebruikt of waarvan de kaart fallbacks ondersteunt zijn:

- available
- area_id
- device_reg_id (Home Assistant device registry id)
- ieee (MAC/IEEE address)
- name
- user_given_name
- model
- manufacturer
- manufacturer_code
- nwk (network short address)
- device_type
- power_source
- last_seen
- rssi (ook gekeken naar rssi_dbm, signal_strength en externe sensors)
- lqi (en eventuele gemiddelde LQI sensoren via `base_entity_id`)
- battery (ondersteunt 0–255 → %-conversie; fallback zoekt ook naar sensor.<device>_battery etc.)
- quirk (samengevoegd object of string; compatibel met `quirk_class` en `quirk_applied`)
- parent_name
- neighbors_names
- routes_names

Opmerking: de kaart kan ook externe sensor-entity states (via `hass.states`) gebruiken voor waarden zoals gemiddelde RSSI/LQI of andere device-gerelateerde sensoren. Gebruik de debug-helper om mogelijke matching entity_ids te vinden.

## Acknowledgements

Deze fork bouwt voort op het originele werk van @dmulcahey en andere bijdragers in de Home Assistant community.

