console.info(
  "%c ZHA Table Card %c 1.0.0 ",
  "color: white; background: #03a9f4; font-weight: bold;",
  "color: #03a9f4; background: white; font-weight: bold;"
);

// Single source-of-truth for preset columns used across form, mapping and defaults
const PRESET_COLUMNS = [
  // basic identity
  { name: 'Name', prop: 'name' },
  { name: 'Object ID', prop: 'object_id' },
  { name: 'NWK', prop: 'nwk' },

  // availability & power
  { name: 'Available', attr: 'available' },
  { name: 'Power Source', prop: 'power_source', attr: 'power_source' },

  // device info
  { name: 'Model', prop: 'model' },
  { name: 'Manufacturer', attr: 'manufacturer' },
  { name: 'IEEE', attr: 'ieee' },

  // radio metrics
  { name: 'RSSI', attr: 'rssi', numeric: true },
  { name: 'LQI (%)', attr: 'lqi', numeric: true, align: 'center' },

  // time
  { name: 'Last Seen', attr: 'last_seen', modify: "(()=>{ if(!x) return ''; const d=new Date(Date.parse(x)); if(isNaN(d)) return x; const now=new Date(); if(d.getDate()==now.getDate()&&d.getMonth()==now.getMonth()&&d.getFullYear()==now.getFullYear()){return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')} else {return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')} })()" },

  // quirks (merged): single column shows an icon with quirk class and whether it's applied
  { name: 'Quirk', attr: 'quirk' },

  // parent / neighbors / routes
  { name: 'Parent', attr: 'parent_name' },
  { name: 'Neighbors', attr: 'neighbors_names', modify: "'<span style=\"display:inline-block; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\" title=\"' + x + '\">' + x + '</span>'" },
  { name: 'Routes', attr: 'routes_names', modify: "'<span style=\"display:inline-block; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\" title=\"' + x + '\">' + x + '</span>'" },

  // battery (single entry)
  { name: 'Battery', attr: 'battery', numeric: true, align: 'center', modify: "(()=>{ if (x===undefined||x===null||x==='') return ''; const n=Number(x); if (Number.isNaN(n)) return x; return (n>100?Math.round(n*100/255):n) + '%'; })()" }
];

/** Helper functions */
// typical [[1,2,3], [6,7,8]] to [[1, 6], [2, 7], [3, 8]] converter
const transpose = (m) => m[0].map((x, i) => m.map((x) => x[i]));

const compare = function (a, b) {
  const aNum = parseFloat(a);
  const bNum = parseFloat(b);

  const aIsNum = !Number.isNaN(aNum);
  const bIsNum = !Number.isNaN(bNum);

  if (aIsNum && bIsNum) {
    return aNum - bNum;
  } else if (aIsNum) {
    return -1;
  } else if (bIsNum) {
    return 1;
  } else {
    return String(a).localeCompare(String(b));
  }
};

// Normalize various color shapes (hex string, rgb object, array, numeric) to CSS hex or rgb() string
function normalizeColor(color) {
  if (!color && color !== 0) return null;
  // Map common material color names to hex for nicer defaults (e.g. 'indigo' -> material indigo)
  const MATERIAL_COLORS = Object.freeze({
    indigo: '#3f51b5',
    blue: '#2196f3',
    red: '#f44336',
    green: '#4caf50',
    teal: '#009688',
    amber: '#ffc107',
    orange: '#ff9800',
    deep_orange: '#ff5722',
    purple: '#9c27b0',
    deep_purple: '#673ab7',
    pink: '#e91e63',
    brown: '#795548',
    grey: '#9e9e9e',
    gray: '#9e9e9e',
    cyan: '#00bcd4',
    lime: '#cddc39',
    yellow: '#ffeb3b'
  });
  // If it's already a string, map known names to hex otherwise return as-is
  if (typeof color === 'string') {
    const key = color.trim().toLowerCase();
    if (MATERIAL_COLORS[key]) return MATERIAL_COLORS[key];
    return color;
  }
  // If it's an object like { r: 255, g: 0, b: 0 } or { red:.. } or ui_color selector format
  if (typeof color === 'object') {
    // Handle array format [r, g, b]
    if (Array.isArray(color) && color.length >= 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    }
    // Handle RGB object formats
    const r = color.r ?? color.red ?? color[0];
    const g = color.g ?? color.green ?? color[1];
    const b = color.b ?? color.blue ?? color[2];
    if ([r,g,b].every((v) => typeof v === 'number')) return `rgb(${r}, ${g}, ${b})`;
    
    // Handle ui_color selector formats
    if (color.rgb_color && Array.isArray(color.rgb_color)) {
      return `rgb(${color.rgb_color[0]}, ${color.rgb_color[1]}, ${color.rgb_color[2]})`;
    }
    if (color.hs_color && Array.isArray(color.hs_color)) {
      const [h, s] = color.hs_color;
      return `hsl(${h}, ${s}%, 50%)`;
    }
    if (typeof color.hex === 'string') return color.hex;
    if (typeof color.value === 'string') return color.value;
    if (typeof color.color === 'string') return color.color;
  }
  // If it's a number, format as hex
  if (typeof color === 'number') {
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
    return hex;
  }
  try { return String(color); } catch (e) { return null; }
}

// Normalize battery numeric values: if >100, assume 0-255 scale and convert to percent
function normalizeBatteryValue(v) {
  if (v === undefined || v === null || v === '') return v;
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n > 100 ? Math.round(n * 100 / 255) : n;
}

class DataTableZHA {
  constructor(cfg) {
    this.cfg = cfg;

    // Zorg dat er altijd een array is
    const userColumns = Array.isArray(cfg.columns) && cfg.columns.length
          ? cfg.columns.map(col => ({ ...col, hidden: col.hidden ?? false }))
      : [{ name: "Name", prop: "name" }];
    cfg.columns = userColumns;

    this.cols = userColumns;

    this.col_ids = this.cols.map(col => col.prop || col.attr || col.attr_as_list);

    this.headers = this.cols
      .filter(col => !col.hidden)
      .map((col, idx) => col.name || this.col_ids[idx]);

    this.rows = [];

  this.sort_by = null; // no forced default; user can click headers to set sorting
  }

  add(...rows) {
    this.rows.push(...rows.map((row) => row.render_data(this.cols)));
  }

  clear_rows() {
    this.rows = [];
  }

  get_rows() {
    if (this.sort_by) {
      let sort_col = this.sort_by;
      let sort_dir = 1;

      if (sort_col) {
        if (["-", "+"].includes(sort_col.slice(-1))) {
          sort_dir = sort_col.slice(-1) == "-" ? -1 : +1;
          sort_col = sort_col.slice(0, -1);
        }
      }

      var sort_idx = this.cols.findIndex((col) =>
        ["id", "attr", "prop", "attr_as_list"].some(
          (attr) => attr in col && sort_col == col[attr]
        )
      );

      if (sort_idx > -1) {
        const isNumeric = this.rows.every(row => {
            const val = row.data[sort_idx]?.content_num;
            return val !== undefined && typeof val === "number" && !Number.isNaN(val);
        });

        this.rows.sort(
            (x, y) =>
              sort_dir *
              compare(
                isNumeric
                  ? x.data[sort_idx]?.content_num
                  : x.data[sort_idx]?.content,
                isNumeric
                  ? y.data[sort_idx]?.content_num
                  : y.data[sort_idx]?.content
              )
          );
      } else {
        console.error(
          `config.sort_by: ${this.cfg.sort_by}, but column not found!`
        );
      }
    }

    this.rows = this.rows.filter((row) => !row.hidden);

    if ("max_rows" in this.cfg && this.cfg.max_rows > -1) {
      this.rows = this.rows.slice(0, this.cfg.max_rows);
    }

    return this.rows;
  }

  updateSortBy(idx) {
    let new_sort = this.cols[idx].attr || this.cols[idx].prop;
    // Allow sorting on any column (including Available). Sorting direction toggles when clicking the same column.
    if (this.sort_by && new_sort === this.sort_by.slice(0, -1)) {
      this.sort_by = new_sort + (this.sort_by.slice(-1) === "-" ? "+" : "-");
    } else {
      this.sort_by = new_sort + "+";
    }
  }
}

class DataRowZHA {
  constructor(device, strict, raw_data = null) {
    this.device = device;
    this.hidden = false;
    this.strict = strict;
    this.raw_data = raw_data;
    this.data = null;
    this.has_multiple = false;
  }

  get_raw_data(col_cfgs, all_rows = []) {
    this.raw_data = col_cfgs.map((col) => {
      if ("attr" in col) {
        
        if (col.attr === "parent_name") {
          const neighbors = this.device.attributes.neighbors || [];
          const parent_ieee = neighbors.find((n) => n.relationship === "Parent")?.ieee;
          if (!parent_ieee) return "-";

          const parent_ieee_norm = String(parent_ieee).toLowerCase();
          for (const row of all_rows) {
            const dev = row.device?.attributes;
            if (!dev) continue;
            const dev_ieee = dev.ieee || dev.mac || dev.extended_pan_id;
            if (dev_ieee && String(dev_ieee).toLowerCase() === parent_ieee_norm) {
              return dev.user_given_name || dev.name || parent_ieee;
            }
          }

          return parent_ieee;
        }

  if (col.attr === "neighbors_names") {
          const neighbors = this.device.attributes.neighbors || [];
          const names = neighbors.map((n) => {
              const searchIeee = String(n.ieee || n.address || n.mac || '').toLowerCase();
              const match = all_rows.find((row) => {
                const devIeee = row.device?.attributes?.ieee || row.device?.attributes?.mac || '';
                return devIeee && String(devIeee).toLowerCase() === searchIeee;
              });
              return match?.device?.attributes?.user_given_name || match?.device?.attributes?.name || n.ieee || n.mac || '';
            }).filter(Boolean).sort((a, b) => a.localeCompare(b));

          return names.join(", ");
        }

        // Generic attribute lookup (manufacturer, model, ieee, rssi, lqi, last_seen, ...)
        if (this.device && this.device.attributes) {
          // Direct match
          if (col.attr in this.device.attributes) return this.device.attributes[col.attr];
          // Support merged 'quirk' attribute: prefer object with { class, applied } or fall back to separate keys
          if (col.attr === 'quirk') {
            const obj = {};
            if ('quirk_class' in this.device.attributes) obj.class = this.device.attributes.quirk_class;
            if ('quirk_applied' in this.device.attributes) obj.applied = this.device.attributes.quirk_applied;
            // If neither present, return undefined to allow other fallbacks
            if (Object.keys(obj).length) return obj;
          }
          // Common fallback names for battery (only prefer `battery`)
          if (col.attr === 'battery') {
            if ('battery' in this.device.attributes) return this.device.attributes.battery;
          }
          // Common fallback names for rssi
          if (col.attr === 'rssi') {
            if ('rssi' in this.device.attributes) return this.device.attributes.rssi;
            if ('rssi_dbm' in this.device.attributes) return this.device.attributes.rssi_dbm;
            if ('signal_strength' in this.device.attributes) return this.device.attributes.signal_strength;
          }
          // Generic search: try to find keys containing 'battery' or 'rssi' when direct keys missing
          const keys = Object.keys(this.device.attributes || {});
          if (col.attr === 'battery') {
            const batteryKey = keys.find(k => /battery/i.test(k));
            if (batteryKey) return this.device.attributes[batteryKey];
            // also check for short 'batt'
            const battKey = keys.find(k => /batt/i.test(k));
            if (battKey) return this.device.attributes[battKey];
          }
          if (col.attr === 'rssi') {
            const rssiKey = keys.find(k => /(rssi|dbm|signal|lqi)/i.test(k));
            if (rssiKey) return this.device.attributes[rssiKey];
          }
        }
        // Fallback: maybe the attribute is at top-level on device object
        if (this.device && col.attr in this.device) {
          return this.device[col.attr];
        }

        if (col.attr === "routes_names") {
          const routes = this.device.attributes.routes || [];
          const hop_set = new Set();
          const names = routes
            .map((r) => {
              let hop = r.next_hop;
              if (hop === undefined || hop === null) return null;
              // Normalize hop to comparable lower-case hex string like "0x1234"
              if (typeof hop === 'string') {
                hop = hop.toLowerCase();
              } else if (typeof hop === 'number') {
                hop = '0x' + hop.toString(16).padStart(4, '0');
              } else {
                hop = String(hop).toLowerCase();
              }

              if (!hop || hop === '0xfffe' || hop_set.has(hop)) return null;
              hop_set.add(hop);

              const status = r.route_status || "";

              const match = all_rows.find((row) => {
                const nwk = row.device?.attributes?.nwk;
                if (nwk === undefined || nwk === null) return false;
                let formatted;
                if (typeof nwk === 'string') {
                  // maybe already hex like '0x1d05'
                  formatted = nwk.toLowerCase();
                } else if (typeof nwk === 'number') {
                  formatted = '0x' + nwk.toString(16).padStart(4, '0').toLowerCase();
                } else {
                  try { formatted = String(nwk).toLowerCase(); } catch (e) { return false; }
                }
                return formatted === hop;
              });

              const name =
                match?.device?.attributes?.user_given_name ||
                match?.device?.attributes?.name ||
                hop;

              return `${name} (${status})`;
            })
            .filter((n) => n)
            .sort((a, b) => a.localeCompare(b));

          return names.join(", ");
        }
      } else if ("prop" in col) {
        if (col.prop == "object_id") {
          return this.device.attributes.device_reg_id;
        } else if (col.prop == "name") {
          if (
            "user_given_name" in this.device.attributes &&
            this.device.attributes["user_given_name"]
          ) {
            return this.device.attributes["user_given_name"];
          } else {
            return this.device.attributes.name || this.device.name;
          }
        } else if (col.prop == "nwk") {
          let hex = this.device.attributes["nwk"];
          if (typeof hex === "string") {
            hex = parseInt(hex, 16);
          }
          return "0x" + hex.toString(16).padStart(4, "0");
        } else {
          // fallback to attributes if prop is not top-level
          if (col.prop in this.device) return this.device[col.prop];
          if (this.device.attributes && col.prop in this.device.attributes) return this.device.attributes[col.prop];
          return null;
        }
      } else if ("attr_as_list" in col) {
        this.has_multiple = true;
        return this.device.attributes[col.attr_as_list];
      } else {
        console.error(`no selector found for col: ${col.name} - skipping...`);
        return null;
      }
    });
  }

  render_data(col_cfgs) {
    const hass = window._zha_card_hass || null;
    let base_entity_id = "";
    const entities = this.device.attributes.entities || [];
    for (const e of entities) {
      if (typeof e === "string" && e.endsWith("_lqi")) {
        base_entity_id = e.replace(/_lqi$/, "");
        break;
      } else if (typeof e === "object" && e.entity_id?.endsWith("_lqi")) {
        base_entity_id = e.entity_id.replace(/_lqi$/, "");
        break;
      }
    }

    this.data = this.raw_data.map((raw, idx) => {
      let x = raw;
      let cfg = col_cfgs[idx];
      let content;

      // runtime fallbacks that require hass/state lookups: try to populate RSSI or battery
      // when the raw attribute is missing. We compute these here so numeric parsing below
      // sees the fallback values as well.
      try {
        if ((cfg && cfg.attr === 'rssi') && (x === undefined || x === null || x === '')) {
          if (hass && base_entity_id) {
            const rssiCandidates = ['_rssi_average', '_rssi', '_rssi_dbm', '_rssi_avg'];
            for (const sfx of rssiCandidates) {
              const ent = hass.states[base_entity_id + sfx];
              if (ent && ent.state !== undefined && ent.state !== 'unknown' && ent.state !== 'unavailable') {
                x = ent.state;
                break;
              }
            }
          }
        }

        if ((cfg && cfg.attr === 'battery') && (x === undefined || x === null || x === '')) {
          if (hass && base_entity_id) {
            const batCandidates = ['_battery'];
            for (const sfx of batCandidates) {
              const ent = hass.states[base_entity_id + sfx];
              if (ent && ent.state !== undefined && ent.state !== 'unknown' && ent.state !== 'unavailable') {
                const st = ent.state;
                const n = Number(st);
                x = Number.isNaN(n) ? st : n;
                break;
              }
            }
          }
        }
      } catch (e) {
        // don't block rendering if hass/state access fails for any reason
      }

        // Heavy fallback: search all hass.states for entity ids that mention this device
        // and appear to be battery/rssi sensors. This is last-resort and used only when
        // we still haven't found a value. It may be a bit more expensive in environments
        // with many entities, but is effective where separate sensors are created.
        try {
          if (hass && (x === undefined || x === null || x === '') && this.device && this.device.attributes) {
            const idPieces = [];
            const attrs = this.device.attributes;
            if (attrs.device_reg_id) idPieces.push(String(attrs.device_reg_id).toLowerCase());
            if (attrs.ieee) idPieces.push(String(attrs.ieee).toLowerCase());
            if (attrs.name) idPieces.push(String(attrs.name).toLowerCase());
            if (this.device.device_reg_id) idPieces.push(String(this.device.device_reg_id).toLowerCase());
            // First try likely exact object_id patterns like sensor.<base>_battery or sensor.<base>_battery_level
            if (idPieces.length && (cfg && (cfg.attr === 'battery' || cfg.attr === 'battery_level'))) {
              const bases = idPieces.map(p => p.replace(/[^a-z0-9_]/gi, '_'));
              const suffixes = ['_battery', '_battery_level', '_battery_percent', '_batt', '_level'];
              const domains = ['sensor', 'binary_sensor', 'device_tracker', 'sensor'];
              let found = false;
              outerLoop: for (const base of bases) {
                for (const sfx of suffixes) {
                  for (const dom of domains) {
                    const eid = `${dom}.${base}${sfx}`.toLowerCase();
                    const ent = hass.states[eid];
                    if (ent && ent.state !== undefined && ent.state !== 'unknown' && ent.state !== 'unavailable') {
                      const st = ent.state;
                      const n = Number(st);
                      x = Number.isNaN(n) ? st : n;
                      found = true;
                      break outerLoop;
                    }
                  }
                }
              }
              if (!found) {
                const keyRegex = /(battery|batt|level|percent)/i;
                for (const eid of Object.keys(hass.states)) {
                  const low = eid.toLowerCase();
                  if (!keyRegex.test(low)) continue;
                  if (!idPieces.some(p => p && low.includes(p))) continue;
                  const ent = hass.states[eid];
                  if (!ent || ent.state === undefined || ent.state === 'unknown' || ent.state === 'unavailable') continue;
                  const st = ent.state;
                  const n = Number(st);
                  x = Number.isNaN(n) ? st : n;
                  break;
                }
              }
            }
          }
        } catch (e) {
          // swallow
        }

  // Custom rendering for Available, Power Source and Quirk applied
      if (cfg.attr === "available") {
        let available = x;
        let icon = available ? "mdi:check-circle" : "mdi:close-circle";
        let color = available ? "#21c960" : "#fa4444";
        content = `<ha-icon icon="${icon}" style="color:${color};vertical-align:middle"></ha-icon>`;

  } else if (cfg && cfg.attr === "power_source") {
        let powerSource = (typeof x === "string" ? x.toLowerCase() : x);
        // try multiple battery attribute keys and normalize
        let battery = undefined;
        if (this.device.attributes) {
          battery = this.device.attributes.battery ?? this.device.attributes.battery_level ?? this.device.attributes.battery_percent ?? this.device.attributes.batt;
        }
        battery = normalizeBatteryValue(battery);
        if (powerSource && powerSource.includes("mains")) {
            content = `<ha-icon icon="mdi:power-plug" style="color:#1976d2;vertical-align:middle"></ha-icon>`;
        } else if (powerSource && powerSource.includes("battery")) {
            content = `<ha-icon icon="mdi:battery" style="color:#faad14;vertical-align:middle"></ha-icon>`;
            if (battery !== undefined && battery !== null && battery !== "") {
                content += ` ${battery}%`;
            }
        } else {
            content = x ?? "N/A";
        }

      } else if (cfg && cfg.attr === 'quirk') {
        // x may be an object { class, applied } or a string.
        let qclass = '';
        let applied = false;
        if (x && typeof x === 'object') {
          qclass = x.class || x.quirk_class || '';
          applied = !!x.applied;
        } else if (typeof x === 'string') {
          qclass = x;
          applied = true;
        } else {
          // fallback: check raw device attributes
          qclass = this.device?.attributes?.quirk_class || '';
          applied = !!this.device?.attributes?.quirk_applied;
        }
        const icon = 'mdi:bug';
        const color = applied ? 'var(--success-color, #2e7d32)' : 'var(--secondary-text-color, #666)';
        const title = qclass ? `${qclass} (${applied ? 'applied' : 'not applied'})` : (applied ? 'quirk applied' : 'no quirk');
        content = `<span title="${title}" style="display:inline-flex;align-items:center;gap:6px;"><ha-icon icon="${icon}" style="--mdc-icon-size:18px;color:${color};opacity:0.95;vertical-align:middle"></ha-icon>${qclass ? `<span style="font-size:0.85em;color:var(--secondary-text-color)">${qclass}</span>` : ''}</span>`;
      } else if (cfg && cfg.attr === 'quirk_applied') {
        // Backwards-compatible: render applied state only (old configs)
        const applied = !!x;
        const icon = applied ? 'mdi:check' : 'mdi:close';
        const color = applied ? 'var(--success-color, #2e7d32)' : 'var(--error-color, #c62828)';
        content = `<ha-icon icon="${icon}" style="--mdc-icon-size:18px;color:${color};opacity:0.85;vertical-align:middle"></ha-icon>`;
      } else {
        if (cfg.modify) {
          try {
            const _hass = window._zha_card_hass || null;
            const fn = new Function('x', 'hass', 'device', `return (${cfg.modify});`);
            content = fn(x, _hass, this.device);
          } catch (err) {
            // Silently fall back to raw value on modification error
            content = x ?? '';
          }
        } else {
          // Default: render empty string for missing values (avoid 'N/A')
          content = x ?? "";
        }
      }

      let numeric = undefined;
      if (cfg.numeric === true) {
        if (cfg.attr === "last_seen" && typeof x === "string") {
          const ts = Date.parse(x);
          numeric = isNaN(ts) ? -Infinity : ts;
        } else {
          // For battery column, normalize possible 0-255 values to percent first
          if (cfg.attr === 'battery') {
            const nv = normalizeBatteryValue(x);
            numeric = typeof nv === 'number' ? nv : parseFloat(nv);
          } else if (cfg.attr === 'rssi' || cfg.attr === 'lqi') {
            // try to parse numeric rssi/lqi, otherwise treat as missing (so sorting puts missing last)
            const parsed = parseFloat(x);
            numeric = Number.isNaN(parsed) ? -Infinity : parsed;
          } else {
            numeric = parseFloat(x);
            if (Number.isNaN(numeric)) {
              const match = typeof content === "string" ? content.match(/[-]?\d+(\.\d+)?/) : null;
              numeric = match ? parseFloat(match[0]) : -Infinity;
            }
          }
        }
      }

      return {
        content: content,
        content_num: numeric,
        pre: cfg.prefix || "",
        suf: cfg.suffix || "",
        css: cfg.align || "left",
        hide: cfg.hidden,
      };
    });

    this.hidden = this.data.some((data) => data === null);
    return this;
  }
}

// Separate class responsible for exposing the editor schema and normalizing
// editor-shaped config objects returned by various HA frontends.
class ZHAConfigUI {
  static getConfigForm() {
    const presetOptions = PRESET_COLUMNS.map(c => ({ value: c.prop || c.attr || c.name, label: c.name }));
    return {
      schema: [
        {
          name: "content",
          type: "expandable", 
          icon: "mdi:text-short",
          schema: [
            {
              type: 'grid',
              name: 'header_grid',
              schema: [
                { name: 'title', required: false, selector: { text: {} } },
                { name: 'title_icon', required: false, selector: { icon: { placeholder: 'mdi:zigbee' } }},
                { name: 'header_color', required: false, selector: { ui_color: { default_color: 'primary' } } },
                { name: 'show_title', required: false, selector: { boolean: {} }, description: 'Show card title', default: true },
                { name: 'show_icon', required: false, selector: { boolean: {} }, description: 'Show header icon', default: true }
              ]
            },
            { name: 'columns', selector: { select: { multiple: true, options: presetOptions, reorder: true } } },
          ]
        },
        {
          name: "interactions",
          type: "expandable",
          icon: "mdi:gesture-tap",
          schema: [
            {
              type: 'grid',
              name: 'features_grid',
              schema: [
                { name: 'sorting', required: false, selector: { boolean: {} }, default: true },
                { name: 'csv_export', required: false, selector: { boolean: {} }, default: true },
                { name: 'filters', required: false, selector: { boolean: {} }, default: true },
                { name: 'search', required: false, selector: { boolean: {} }, default: true }
              ],
              description: 'Feature toggles'
            }
          ]
        }
      ]
    };
  }

  // Normalize the variety of shapes the HA editor or user may hand us.
  // Returns a new config object safe to use by the card.
  static normalizeConfig(inCfg) {
    const cfg = Object.assign({}, inCfg || {});
    try {
      if (cfg.content && typeof cfg.content === 'object') {
        const c = cfg.content;
        if (c.header_grid && typeof c.header_grid === 'object') {
          const hg = c.header_grid;
          if (hg.title !== undefined) cfg.title = hg.title;
          if (hg.title_icon !== undefined) cfg.title_icon = hg.title_icon;
          if (hg.color !== undefined) cfg.color = hg.color;
          if (hg.show_title !== undefined) cfg.show_title = hg.show_title;
          if (hg.show_icon !== undefined) cfg.show_icon = hg.show_icon;
        }
      }
      if (cfg.interactions && typeof cfg.interactions === 'object') {
        const it = cfg.interactions;
        if (it.features_grid && typeof it.features_grid === 'object') {
          const fg = it.features_grid;
          if (fg.sorting !== undefined) cfg.sorting = fg.sorting;
          if (fg.csv_export !== undefined) cfg.csv_export = fg.csv_export;
          if (fg.filters !== undefined) cfg.filters = fg.filters;
          if (fg.search !== undefined) cfg.search = fg.search;
        }
      }
    } catch (e) {
      console.warn('Failed to merge expandable groups into config', e);
    }

    try {
      const maybeHG = cfg.header_grid || (cfg.content && cfg.content.header_grid);
      if (maybeHG && typeof maybeHG === 'object') {
        const hg = maybeHG;
        if (hg.title !== undefined) cfg.title = hg.title;
        if (hg.title_icon !== undefined) cfg.title_icon = hg.title_icon;
        if (hg.header_color !== undefined) cfg.color = hg.header_color;
        if (hg.color !== undefined) cfg.color = hg.color;
        if (hg.show_title !== undefined) cfg.show_title = hg.show_title;
        if (hg.show_icon !== undefined) cfg.show_icon = hg.show_icon;
      }

      const presetMap = PRESET_COLUMNS.reduce((acc, c) => { const key = c.prop || c.attr || c.name; acc[key] = c; return acc; }, {});

      if (cfg.content && Array.isArray(cfg.content.columns)) {
        cfg.columns = cfg.content.columns.map((c) => {
          if (typeof c === 'string') {
            const preset = presetMap[c];
            if (preset) return Object.assign({}, preset);
            return { prop: c, name: c };
          }
          if (c && typeof c === 'object') return Object.assign({}, c);
          return { prop: String(c), name: String(c) };
        });
      }

      if (Array.isArray(cfg.columns) && cfg.columns.length && typeof cfg.columns[0] === 'string') {
        cfg.columns = cfg.columns.map((c) => {
          if (typeof c === 'string') {
            const preset = presetMap[c];
            if (preset) return Object.assign({}, preset);
            return { prop: c, name: c };
          }
          return Object.assign({}, c);
        });
      }

      const providedVisible = Array.isArray(cfg.visible_columns)
        ? cfg.visible_columns
        : Array.isArray(cfg.content && cfg.content.visible_columns)
        ? cfg.content.visible_columns
        : null;

      if (Array.isArray(providedVisible)) {
        const visibleKeys = providedVisible.map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') return item.prop || item.attr || item.name || JSON.stringify(item);
          return String(item);
        }).map(String);

        if (!Array.isArray(cfg.columns) || !cfg.columns.length) {
          cfg.columns = PRESET_COLUMNS.map(c => Object.assign({}, c));
        }

        const colMap = new Map();
        cfg.columns.forEach((col) => {
          const key = String(col.prop || col.attr || col.name || JSON.stringify(col));
          colMap.set(key, Object.assign({}, col));
        });

        const ordered = [];
        visibleKeys.forEach((k) => {
          if (colMap.has(k)) {
            const c = colMap.get(k);
            c.hidden = false;
            ordered.push(c);
            colMap.delete(k);
          } else {
            ordered.push({ prop: k, name: presetMap[k] || k, hidden: false });
          }
        });

        for (const [key, col] of colMap.entries()) {
          col.hidden = true;
          ordered.push(col);
        }

        cfg.columns = ordered;
        cfg.visible_columns = visibleKeys;
      }
    } catch (e) {
      console.warn('Failed to merge nested editor groups into config', e);
    }

    // sensible defaults
    if (cfg.title === undefined) cfg.title = "Table";
    if (cfg.title_icon === undefined) cfg.title_icon = "mdi:zigbee";
    if (cfg.filters === undefined) cfg.filters = true;
    if (cfg.search === undefined) cfg.search = true;
    if (cfg.csv_export === undefined) cfg.csv_export = true;
    if (cfg.clickable === undefined) cfg.clickable = true;
    if (cfg.offline_first === undefined) cfg.offline_first = true;

    // Normalize color shapes returned by ui_color selector
    if (cfg.color && typeof cfg.color === 'object') {
      // Handle various ui_color selector return formats
      if (typeof cfg.color.color === 'string' && cfg.color.color) cfg.color = cfg.color.color;
      else if (typeof cfg.color.value === 'string' && cfg.color.value) cfg.color = cfg.color.value;
      else if (typeof cfg.color.theme === 'string' && cfg.color.theme) cfg.color = cfg.color.theme;
      else if (typeof cfg.color.rgb_color === 'object' && cfg.color.rgb_color) {
        const rgb = cfg.color.rgb_color;
        cfg.color = `rgb(${rgb[0] || rgb.r || 0}, ${rgb[1] || rgb.g || 0}, ${rgb[2] || rgb.b || 0})`;
      }
      else if (typeof cfg.color.hex === 'string' && cfg.color.hex) cfg.color = cfg.color.hex;
      else if (typeof cfg.color.hs_color === 'object' && cfg.color.hs_color) {
        // Convert HS to hex approximation
        const [h, s] = cfg.color.hs_color;
        cfg.color = `hsl(${h || 0}, ${s || 0}%, 50%)`;
      }
      else {
        try {
          const norm = normalizeColor(cfg.color);
          if (norm) cfg.color = norm;
          else if (cfg.color.css && typeof cfg.color.css === 'string') cfg.color = cfg.color.css;
          else if (cfg.color.var && typeof cfg.color.var === 'string') cfg.color = cfg.color.var;
          else if (cfg.color.state && typeof cfg.color.state === 'string') cfg.color = cfg.color.state;
          else cfg.color = JSON.stringify(cfg.color);
        } catch (e) {
          cfg.color = String(cfg.color);
        }
      }
    }

    return cfg;
  }
}
    
class ZHATableCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.card_height = 1;
    this.tbl = null;
    this._eventListeners = new Map();
  }

  _cleanupEventListeners() {
    // Remove all tracked event listeners
    this._eventListeners.forEach((listener, element) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(listener.event, listener.handler);
      }
    });
    this._eventListeners.clear();
  }

  _addEventListenerTracked(element, event, handler) {
    element.addEventListener(event, handler);
    this._eventListeners.set(element, { event, handler });
  }

  static getConfigForm() {
    // Delegate to the dedicated config UI helper
    return ZHAConfigUI.getConfigForm();
  }

  setConfig(config) {
    const root = this.shadowRoot;
    if (root && root.lastChild) {
      this._cleanupEventListeners();
      root.removeChild(root.lastChild);
    }
    // Normalize config shapes via ZHAConfigUI helper (all normalization is handled there)
    const cfg = ZHAConfigUI.normalizeConfig(config);

      const card = document.createElement("ha-card");
      // Show icon and/or title based on config
      let showTitle = cfg.show_title !== false;
      let showIcon = cfg.show_icon !== false;
      if (showTitle || showIcon) {
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        if (showIcon && cfg.title_icon) {
          const iconEl = document.createElement('ha-icon');
          iconEl.setAttribute('icon', cfg.title_icon);
          iconEl.style.verticalAlign = 'middle';
          iconEl.style.marginRight = showTitle ? '6px' : '0';
          headerDiv.appendChild(iconEl);
        }
        if (showTitle) {
          const span = document.createElement('span');
          span.innerText = cfg.title || '';
          headerDiv.appendChild(span);
        }
        card.header = headerDiv;
      } else {
        card.header = '';
      }
      this.tbl = new DataTableZHA(cfg);
    
      // Load previous filters and sorting from sessionStorage
      const saved = JSON.parse(sessionStorage.getItem("zha_card_filters") || "{}");
      if (saved.sort_by) {
        this.tbl.sort_by = saved.sort_by;
      }
    
      // Generate table headers from visible columns and keep original indices
      const visibleCols = this.tbl.cols.map((col, idx) => ({ col, idx })).filter(({ col }) => !col.hidden);
      const headersHtml = visibleCols
        .map(({ col, idx }) => {
          const id = (col.name || col.prop || col.attr || `col${idx}`).replace(/\s+/g, '_');
          return `<th class="${col.align || 'left'}" data-idx="${idx}" id="${id}">${col.name || col.prop || col.attr || `col${idx}`}</th>`;
        })
        .join("");
    
      // Build the full card HTML: filters and table
      const wrapper = document.createElement("div");
      let filtersHtml = '';
      if (cfg.filters !== false) {
        filtersHtml += `
          <div id="filters" style="padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
            <label>
              <span class="label-text">Area</span>
              <select id="filter-area"><option value="">All</option></select>
            </label>
            <label>
              <span class="label-text">Model</span>
              <select id="filter-model"><option value="">All</option></select>
            </label>
            <label>
              <span class="label-text">Device Type</span>
              <select id="filter-type"><option value="">All</option></select>
            </label>
            <label>
              <span class="label-text">Online</span>
              <select id="filter-online">
                <option value="">All</option>
                <option value="true">Online</option>
                <option value="false">Offline</option>
              </select>
            </label>
            <!-- Clear Filters button placed next to the filter controls -->
            <div style="display:flex; align-items:center;">
              <button id="clear-filters" type="button" style="margin-left:8px">Clear Filters</button>
            </div>
          </div>
        `;
      }
      let searchHtml = '';
      if (cfg.search !== false) {
        searchHtml += `
          <div id="search" style="padding: 10px; display: flex; align-items: center; gap: 8px;">
            <label style="flex: 1;">
              <div class="name-wrapper" style="display: flex; position: relative;">
                <input id="filter-name" type="text" placeholder="Search by name..." style="width: 100%;" />
                <!-- Visible clear button for search (handler exists below) -->
                <button id="clear-name" type="button">Clear</button>
              </div>
            </label>
          </div>
        `;
      }

      wrapper.innerHTML = `
        ${filtersHtml}
        ${searchHtml}
        <div style="text-align: left; padding: 0 10px 10px;">
          <div style="display: flex; gap: 10px;">
            ${cfg.csv_export === false ? '' : '<button id="export-csv">Export to CSV</button>'}
          </div>
        </div>

        <div id="table-wrapper" style="overflow-x:auto;">
          <table>
            <thead><tr>${headersHtml}</tr></thead>
            <tbody id="zhatable"></tbody>
          </table>
        </div>
      `;
    
      // determine header color based on config  
      let headerColor = '#03a9f4';
      if (cfg.color) {
        // Debug: log color value to help troubleshoot ui_color issues
        if (typeof cfg.color === 'object') {
          console.log('ZHA Table Card: Received color object:', cfg.color);
        }
        // Handle named color palette keywords and normalize values
        if (cfg.color === 'state' || cfg.color === 'State color (default)') headerColor = 'var(--state-icon-color, var(--primary-color))';
        else if (cfg.color === 'primary' || cfg.color === 'Primary color') headerColor = 'var(--primary-color)';
        else if (cfg.color === 'accent' || cfg.color === 'Accent color') headerColor = 'var(--accent-color, var(--primary-color))';
        else if (cfg.color === 'disabled' || cfg.color === 'Disabled color') headerColor = 'var(--disabled-text-color)';
        else if (cfg.color === 'red' || cfg.color === 'Red') headerColor = 'var(--red-color, #f44336)';
        else if (cfg.color === 'pink' || cfg.color === 'Pink') headerColor = 'var(--pink-color, #e91e63)';
        else if (cfg.color === 'purple' || cfg.color === 'Purple') headerColor = 'var(--purple-color, #9c27b0)';
        else if (cfg.color === 'deep-purple' || cfg.color === 'Deep Purple') headerColor = 'var(--deep-purple-color, #673ab7)';
        else if (cfg.color === 'indigo' || cfg.color === 'Indigo') headerColor = 'var(--indigo-color, #3f51b5)';
        else if (cfg.color === 'blue' || cfg.color === 'Blue') headerColor = 'var(--blue-color, #2196f3)';
        else if (cfg.color === 'light-blue' || cfg.color === 'Light Blue') headerColor = 'var(--light-blue-color, #03a9f4)';
        else if (cfg.color === 'cyan' || cfg.color === 'Cyan') headerColor = 'var(--cyan-color, #00bcd4)';
        else if (cfg.color === 'teal' || cfg.color === 'Teal') headerColor = 'var(--teal-color, #009688)';
        else if (cfg.color === 'green' || cfg.color === 'Green') headerColor = 'var(--green-color, #4caf50)';
        else if (cfg.color === 'light-green' || cfg.color === 'Light Green') headerColor = 'var(--light-green-color, #8bc34a)';
        else if (cfg.color === 'lime' || cfg.color === 'Lime') headerColor = 'var(--lime-color, #cddc39)';
        else if (cfg.color === 'yellow' || cfg.color === 'Yellow') headerColor = 'var(--yellow-color, #ffeb3b)';
        else if (cfg.color === 'amber' || cfg.color === 'Amber') headerColor = 'var(--amber-color, #ffc107)';
        else if (cfg.color === 'orange' || cfg.color === 'Orange') headerColor = 'var(--orange-color, #ff9800)';
        else if (cfg.color === 'deep-orange' || cfg.color === 'Deep Orange') headerColor = 'var(--deep-orange-color, #ff5722)';
        else if (cfg.color === 'brown' || cfg.color === 'Brown') headerColor = 'var(--brown-color, #795548)';
        else if (cfg.color === 'grey' || cfg.color === 'gray' || cfg.color === 'Grey' || cfg.color === 'Gray') headerColor = 'var(--grey-color, #9e9e9e)';
        else if (cfg.color === 'blue-grey' || cfg.color === 'Blue Grey') headerColor = 'var(--blue-grey-color, #607d8b)';
        else if (cfg.color === 'black' || cfg.color === 'Black') headerColor = 'var(--google-black, #000000)';
        else if (cfg.color === 'white' || cfg.color === 'White') headerColor = 'var(--google-white, #ffffff)';
        else if (cfg.color === 'none' || cfg.color === 'None' || cfg.color === 'transparent') headerColor = 'transparent';
        else if (cfg.color === 'auto' || cfg.color === 'Auto') headerColor = 'var(--ha-card-header-color, var(--primary-text-color))';
        else {
          const norm = normalizeColor(cfg.color);
          headerColor = norm || cfg.color;
        }
      }

      // Card style
      const style = document.createElement("style");
      style.textContent = `
          table { width: 100%; padding: 16px; }
          thead th { text-align: left; }
          tr td, th { padding-left: 0.5em; padding-right: 0.5em; }
          tr td.left, th.left { text-align: left; }
          tr td.center, th.center { text-align: center; }
          tr td.right, th.right { text-align: right; }
          th { background-color: ${headerColor}; color: white; }
          .headerSortDown:after,
          .headerSortUp:after {
            content: ' ';
            position: relative;
            left: 2px;
            border: 8px solid transparent;
          }
          .headerSortDown:after { top: 10px; border-top-color: white; }
          .headerSortUp:after { bottom: 15px; border-bottom-color: white; }
          .headerSortDown,
          .headerSortUp { padding-right: 10px; }
          tbody tr:nth-child(odd) { background-color: var(--paper-card-background-color); }
          tbody tr:nth-child(even) { background-color: var(--secondary-background-color); }
          .switch-row { display: inline-flex; align-items: center; gap: 8px; margin-right: 8px; }
          #filters { gap: 8px !important; }
        `;
    
      // Append elements to the card
      card.appendChild(style);
      card.appendChild(wrapper);
      root.appendChild(card);
    
      this._config = cfg;
    
      // Restore selected filter values if present
      ["filter-area", "filter-model", "filter-type", "filter-online"].forEach((id) => {
        if (saved[id.replace("filter-", "")]) {
          const el = this.shadowRoot.getElementById(id);
          if (el) el.value = saved[id.replace("filter-", "")];
        }
      });
      // restore name filter only if search is enabled and saved
      if (cfg.search !== false && saved.name) {
        const nameEl = this.shadowRoot.getElementById('filter-name');
        if (nameEl) nameEl.value = saved.name;
      }
    
      // Add sorting listeners to header elements (use data-idx to reference original column index)
      const headers = root.querySelectorAll('th');
      headers.forEach((header) => {
        const clickHandler = () => {
          try {
            // respect global sorting enabled flag
            if (cfg.sorting === false) return;

            const origIdx = parseInt(header.dataset.idx);
            if (Number.isNaN(origIdx)) return;

            const colCfg = this.tbl.cols[origIdx];
            if (!colCfg || colCfg.sortable === false) return;

            // Clear previous sort indicators
            headers.forEach((h) => h.classList.remove('headerSortDown', 'headerSortUp'));

            // Toggle sort direction based on original column index
            this.tbl.updateSortBy(origIdx);

            if (this.tbl.sort_by && this.tbl.sort_by.includes('+')) {
              header.classList.add('headerSortUp');
            } else {
              header.classList.add('headerSortDown');
            }

            this.applyFilters?.();
          } catch (err) {
            console.error('Header click failed', err);
          }
        };
        this._addEventListenerTracked(header, 'click', clickHandler);
      });
    }

  _updateContent(element, rows) {
    // callback for updating the cell-contents
    element.innerHTML = rows
      .map(
        (row) =>
          `<tr id="device_row_${
            row.device.attributes.device_reg_id
          }">${row.data
            .map((cell) =>
              !cell.hide
                ? `<td class="${cell.css}">${cell.pre}${cell.content}${cell.suf}</td>`
                : ""
            )
            .join("")}</tr>`
      )
      .join("");

    // if configured, set clickable row to show device popup-dialog
    rows.forEach((row) => {
      const elem = this.shadowRoot.getElementById(
        `device_row_${row.device.attributes.device_reg_id}`
      );
      const root = this.shadowRoot;
      // bind click()-handler to row (if configured)
      if (this.tbl.cfg.clickable) {
        const clickHandler = function (clk_ev) {
            let ev = new Event("location-changed", {
              bubbles: true,
              cancelable: false,
              composed: true,
            });
            ev.detail = { replace: false };
            history.pushState(
              null,
              "",
              "/config/devices/device/" + row.device.attributes.device_reg_id
            );
            root.dispatchEvent(ev);
          };
        this._addEventListenerTracked(elem, 'click', clickHandler);
      }
    });
  }

    applySorting(rows) {
      // Respect global sorting flag on the card
      if (this._config && this._config.sorting === false) return rows;

      // If configured, always put offline devices (available === false) first
      if (this._config && this._config.offline_first) {
        rows.sort((a,b) => {
          const aAvail = a.device?.attributes?.available;
          const bAvail = b.device?.attributes?.available;
          if (aAvail === bAvail) return 0;
          // offline (false) => should come first
          if (aAvail === false) return -1;
          if (bAvail === false) return 1;
          return 0;
        });
      }

      const sort_col = this.tbl.sort_by;
      if (!sort_col) return rows;

      const col_key = sort_col.slice(0, -1);
      const sort_dir = sort_col.endsWith("-") ? -1 : 1;

      const sort_idx = this.tbl.cols.findIndex((col) =>
        ["id", "attr", "prop", "attr_as_list"].some(
          (attr) => attr in col && col[attr] === col_key
        )
      );

      if (sort_idx >= 0) {
        // Respect per-column sortable flag
        const colCfg = this.tbl.cols[sort_idx];
        if (colCfg && colCfg.sortable === false) return rows;

        const isNumeric = rows.every(row =>
          typeof row.data[sort_idx]?.content_num === "number" &&
          !Number.isNaN(row.data[sort_idx]?.content_num)
        );

        rows.sort((a, b) =>
          sort_dir *
          compare(
            isNumeric ? a.data[sort_idx]?.content_num : a.data[sort_idx]?.content,
            isNumeric ? b.data[sort_idx]?.content_num : b.data[sort_idx]?.content
          )
        );
      }

      return rows;
    }

    applyFilters() {
      const root = this.shadowRoot;
    
      // Retrieve current filter values
      const areaVal = root.getElementById("filter-area")?.value;
      const modelVal = root.getElementById("filter-model")?.value;
      const typeVal = root.getElementById("filter-type")?.value;
      const onlineVal = root.getElementById("filter-online")?.value;
      const nameVal = root.getElementById("filter-name")?.value?.toLowerCase();
    
      // Highlight active filters (adds visual indicator for any non-empty filter)
      ["filter-area", "filter-model", "filter-type", "filter-online", "filter-name"].forEach((id) => {
        const el = root.getElementById(id);
        if (el) {
          el.classList.toggle("filter-active", !!el.value);
        }
      });

      // Show/hide the Clear button for name filter only when there's content
      // The button is hidden by default in the template; we toggle its display here
      const clearNameEl = root.getElementById('clear-name');
      try {
        const nameElem = root.getElementById('filter-name');
        if (clearNameEl) {
          if (nameElem && nameElem.value) {
            clearNameEl.style.display = '';
          } else {
            clearNameEl.style.display = 'none';
          }
        }
      } catch (e) {}
    
      // Save current filters and sorting to sessionStorage
      sessionStorage.setItem("zha_card_filters", JSON.stringify({
        area: areaVal,
        model: modelVal,
        type: typeVal,
        online: onlineVal,
        name: nameVal,
        sort_by: this.tbl.sort_by
      }));
    
      // Filter rows
      let filteredRows = this.tbl.rows.filter((row) => {
        const dev = row.device?.attributes;
        if (!dev) return false;
    
        if (areaVal && dev.area_id !== areaVal) return false;
        if (modelVal && dev.model !== modelVal) return false;
        if (typeVal && dev.device_type !== typeVal) return false;
        if (onlineVal && String(dev.available) !== onlineVal) return false;
        if (
          nameVal &&
          !dev.name?.toLowerCase().includes(nameVal) &&
          !dev.user_given_name?.toLowerCase().includes(nameVal)
        ) {
          return false;
        }
    
        return true;
      });
    
      // Sort filtered rows
      filteredRows = this.applySorting(filteredRows);
    
      // Update UI
      this._setCardSize(filteredRows.length);
      this._updateContent(root.getElementById("zhatable"), filteredRows);
    }

  _saveFilterState() {
      const root = this.shadowRoot;
      const state = {
        sort_by: this.tbl.sort_by,
        area: root.getElementById("filter-area")?.value || "",
        model: root.getElementById("filter-model")?.value || "",
        type: root.getElementById("filter-type")?.value || "",
        online: root.getElementById("filter-online")?.value || "",
        name: root.getElementById("filter-name")?.value || "",
      };
      sessionStorage.setItem("zha_card_filters", JSON.stringify(state));
    }

  set hass(hass) {
      const config = this._config;
      const root = this.shadowRoot;
      this._hass = hass;
      window._zha_card_hass = hass;
    
      hass.callWS({ type: "zha/devices" }).then((devices) => {
        // Follow the pattern used by zha-network-card: wrap each returned device
        // into an object with an `attributes` property. This ensures a consistent
        // shape for DataRowZHA and avoids copying top-level keys that may not exist.
        const rawRows = devices.map((device) => new DataRowZHA({ attributes: device }, config.strict));
        rawRows.forEach((row) => row.get_raw_data(config.columns, rawRows));
    
        this.tbl.clear_rows();
    
        // Populate filter dropdowns (area, model, type)
        const areaSet = new Set();
        const modelSet = new Set();
        const typeSet = new Set();
    
        rawRows.forEach((row) => {
          const dev = row.device?.attributes;
          if (!dev) return;
          if (dev.area_id) areaSet.add(dev.area_id);
          if (dev.model) modelSet.add(dev.model);
          if (dev.device_type) typeSet.add(dev.device_type);
        });
    
        const populateSelect = (id, values) => {
          const select = root.getElementById(id);
          if (!select) return;
    
          const previous = select.value;
          while (select.options.length > 1) select.remove(1);
    
          [...values].sort().forEach((val) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
          });
    
          if ([...select.options].some((o) => o.value === previous)) {
            select.value = previous;
          }
        };
    
        populateSelect("filter-area", areaSet);
        populateSelect("filter-model", modelSet);
        populateSelect("filter-type", typeSet);
    
        // Add listeners to inputs and select elements
        const filterIds = ["filter-area", "filter-model", "filter-type", "filter-online", "filter-name"];
        filterIds.forEach((id) => {
          const el = root.getElementById(id);
          if (!el) return;
    
          const changeHandler = () => {
            this.applyFilters();
            this._saveFilterState();
          };
          this._addEventListenerTracked(el, "change", changeHandler);
    
          if (id === "filter-name") {
            const inputHandler = () => {
              this.applyFilters();
              this._saveFilterState();
            };
            this._addEventListenerTracked(el, "input", inputHandler);
          }
        });
    
        // Restore filters and sorting
        const saved = JSON.parse(sessionStorage.getItem("zha_card_filters") || "{}");
        filterIds.forEach((id) => {
          const el = root.getElementById(id);
          const key = id.replace("filter-", "");
          if (saved[key] !== undefined && el) {
            el.value = saved[key];
            el.classList.add("filter-active");
          }
        });
    
        if (saved.sort_by) {
          this.tbl.sort_by = saved.sort_by;
        }
    
        // Add rows to the table (raw, before filtering)
        rawRows.forEach((row) => {
          if (!row.has_multiple) {
            this.tbl.add(row);
          } else {
            this.tbl.add(
              ...transpose(row.raw_data).map(
                (data) => new DataRowZHA(row.device, row.strict, data)
              )
            );
          }
        });
    
        this.applyFilters();
        
        // Clear Filters button handler
        // NOTE: this should clear the select-type filters but keep the text search intact
        const clearButton = root.getElementById("clear-filters");
        if (clearButton) {
          const clearHandler = () => {
            // clear only the dropdown/select filters; keep the search input (filter-name) as-is
            ["filter-area", "filter-model", "filter-type", "filter-online"].forEach((id) => {
              const el = root.getElementById(id);
              if (el) {
                el.value = "";
                el.classList.remove("filter-active");
              }
            });
            // Persist the updated filters (preserving any search text) instead of removing saved state
            this._saveFilterState();
            this.applyFilters();
          };
          this._addEventListenerTracked(clearButton, "click", clearHandler);
        }
        
        // Clear "name" text input (× button)
        const clearNameBtn = root.getElementById("clear-name");
        if (clearNameBtn) {
          const clearNameHandler = () => {
            const nameInput = root.getElementById("filter-name");
            if (nameInput) {
              nameInput.value = "";
              nameInput.classList.remove("filter-active");
              this._saveFilterState();
              this.applyFilters();
            }
          };
          this._addEventListenerTracked(clearNameBtn, "click", clearNameHandler);
        }
        
        // Handle CSV export (only when enabled)
        const exportBtn = root.getElementById("export-csv");
        if (exportBtn) {
          const exportHandler = () => {
            if (cfg.csv_export === false) return;
            const rows = this.tbl.get_rows();
            if (!rows.length) return;

            const headers = this.tbl.headers;
            const csv = [];

            // Headers
            csv.push(headers.join(","));

            // Rows
            rows.forEach((row) => {
              const values = row.data.map((cell) => {
                  const temp = document.createElement("div");
                  temp.innerHTML = cell.content || "";
                  const textOnly = temp.textContent || "";
                  return `"${textOnly.replace(/"/g, '""')}"`;
                });
              csv.push(values.join(","));
            });

            const blob = new Blob([csv.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "zha_devices.csv";
            a.click();
            URL.revokeObjectURL(url);
          };
          this._addEventListenerTracked(exportBtn, "click", exportHandler);
        }
      });
    }

  _setCardSize(num_rows) {
    this.card_height = parseInt(num_rows * 0.5);
  }

  getCardSize() {
    return this.card_height;
  }

  disconnectedCallback() {
    // Cleanup when element is removed from DOM
    this._cleanupEventListeners();
  }
}

customElements.define("zha-table-card", ZHATableCard);

/* ---------- Register the card so it shows up in the Lovelace card picker ----------- */
window.customCards = window.customCards || [];
window.customCards.push({
  type: "zha-table-card",
  name: "ZHA Table Card",
  description: "Displays ZHA Zigbee devices in a table with status",
  preview: true,
});

// Debug helper: call `window.zha_table_card_debug(hass)` in the browser console
// to print a diagnostic summary of ZHA devices, their attributes and likely
// matching entity ids for battery/RSSI. Useful to tune fallback heuristics.
window.zha_table_card_debug = async function(hass) {
  if (!hass) {
    console.warn('Please pass the Home Assistant `hass` object, e.g. window.hass or window._zha_card_hass');
    return;
  }
  try {
    const devices = await hass.callWS({ type: 'zha/devices' });
    console.group('ZHA Table Card Debug - devices: ' + devices.length);
    for (const d of devices.slice(0, 25)) {
      console.groupCollapsed(`device: ${d.attributes?.name || d.name || d.device_reg_id || '(no name)'} (${d.attributes?.device_reg_id || d.device_reg_id || 'no-id'})`);
      console.log('attributes keys:', Object.keys(d.attributes || {}).sort());
      const idPieces = [];
      if (d.attributes?.device_reg_id) idPieces.push(String(d.attributes.device_reg_id).toLowerCase());
      if (d.attributes?.ieee) idPieces.push(String(d.attributes.ieee).toLowerCase());
      if (d.attributes?.name) idPieces.push(String(d.attributes.name).toLowerCase());
      const keys = Object.keys(hass.states || {});
      const matches = keys.filter(k => {
        const low = k.toLowerCase();
        return idPieces.some(p => p && low.includes(p)) && /(rssi|dbm|signal|lqi|battery|batt|level|percent)/i.test(low);
      }).slice(0,10);
      console.log('likely matching sensor entity_ids (first 10):', matches);
      console.groupEnd();
    }
    console.groupEnd();
  } catch (e) {
    console.error('Debug helper failed', e);
  }
};