console.info(
  "%c ZHA Table Card %c 1.0.0 ",
  "color: white; background: #03a9f4; font-weight: bold;",
  "color: #03a9f4; background: white; font-weight: bold;"
);

/** some helper functions, mmmh, am I the only one needing those? Am I doing something wrong? */
// typical [[1,2,3], [6,7,8]] to [[1, 6], [2, 7], [3, 8]] converter
var transpose = (m) => m[0].map((x, i) => m.map((x) => x[i]));

// single items -> Array with item with length == 1
var listify = (obj) => (obj instanceof Array ? obj : [obj]);
    
var compare = function (a, b) {
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

    this.sort_by = "available-"; // standaard sorteren: unavailable eerst
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
    if (idx === 0) return; // niet sorteren op Available
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

          for (const row of all_rows) {
            const dev = row.device?.attributes;
            if (dev?.ieee === parent_ieee) {
              return dev.user_given_name || dev.name || parent_ieee;
            }
          }

          return parent_ieee;
        }

        if (col.attr === "neighbors_names") {
          const neighbors = this.device.attributes.neighbors || [];
          const names = neighbors.map((n) => {
              const match = all_rows.find((row) => row.device?.attributes?.ieee === n.ieee);
              return match?.device?.attributes?.user_given_name || match?.device?.attributes?.name || n.ieee;
            }).sort((a, b) => a.localeCompare(b));
          
          return names.join(", ");
        }

        if (col.attr === "routes_names") {
          const routes = this.device.attributes.routes || [];
          const hop_set = new Set();
          const names = routes
            .map((r) => {
              const hop = r.next_hop?.toLowerCase();
              if (!hop || hop === "0xfffe" || hop_set.has(hop)) return null;
              hop_set.add(hop);

              const status = r.route_status || "";

              const match = all_rows.find((row) => {
                  const nwk = row.device?.attributes?.nwk;
                  const formatted = "0x" + nwk.toString(16).padStart(4, "0").toLowerCase();
                  return formatted === hop;
                });

              const name =
                match?.device?.attributes?.user_given_name ||
                match?.device?.attributes?.name ||
                hop;

              return `${name} (${status})`;
            })
            .filter((n) => n !== null)
            .sort((a, b) => a.localeCompare(b));

          return names.join(", ");
        }

        return col.attr in this.device.attributes
          ? this.device.attributes[col.attr]
          : null;
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
            return this.device.attributes.name;
          }
        } else if (col.prop == "nwk") {
          let hex = this.device.attributes["nwk"];
          if (typeof hex === "string") {
            hex = parseInt(hex, 16);
          }
          return "0x" + hex.toString(16).padStart(4, "0");
        } else {
          return col.prop in this.device ? this.device[col.prop] : null;
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

      // Custom rendering for Available and Power Source
      if (cfg.attr === "available") {
        let available = x;
        let icon = available ? "mdi:check-circle" : "mdi:close-circle";
        let color = available ? "#21c960" : "#fa4444";
        content = `<ha-icon icon="${icon}" style="color:${color};vertical-align:middle"></ha-icon>`;

      } else if (cfg && cfg.attr === "power_source") {
        let powerSource = (typeof x === "string" ? x.toLowerCase() : x);
        let battery = this.device.attributes.battery || this.device.attributes.battery_level;
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

      } else {
        content = cfg.modify ? eval(cfg.modify) : x ?? "N/A";
      }

      let numeric = undefined;
      if (cfg.numeric === true) {
        if (cfg.attr === "last_seen" && typeof x === "string") {
          const ts = Date.parse(x);
          numeric = isNaN(ts) ? -Infinity : ts;
        } else {
          numeric = parseFloat(x);
          if (Number.isNaN(numeric)) {
            const match = typeof content === "string" ? content.match(/[-]?\d+(\.\d+)?/) : null;
            numeric = match ? parseFloat(match[0]) : -Infinity;
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
    
class ZHATableCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.card_height = 1;
    this.tbl = null;
  }

  static getConfigForm() {
    return {
      schema: [
        {
          type: "grid",
          name: "header_grid",
          schema: [
            { name: "title", required: false, selector: { text: {} } },
            {
              name: "title_icon",
              required: false,
              selector: {
                icon: {
                  // placeholder: "mdi:table"
                }
              }
            },
            {
              name: "color",
              required: false,
              selector: {
                color: {
                  placeholder: "#03a9f4"
                }
              }
            }
          ]
        },
        { name: "show_title", required: false, selector: { boolean: {} }, description: "Show card title" },
        { name: "show_icon", required: false, selector: { boolean: {} }, description: "Show card icon" },
        { name: "columns", required: false, selector: { text: {} }, description: "Comma-separated column names or YAML for advanced columns" },
        { name: "sorting_enabled", required: false, selector: { boolean: {} }, description: "Enable sorting" },
        { name: "csv_enabled", required: false, selector: { boolean: {} }, description: "Enable CSV export" },
        { name: "filters_enabled", required: false, selector: { boolean: {} }, description: "Show filters" },
        { name: "search_enabled", required: false, selector: { boolean: {} }, description: "Show search" }
      ]
    };
  }

  setConfig(config) {
    const root = this.shadowRoot;
    if (root && root.lastChild) root.removeChild(root.lastChild);
    const cfg = Object.assign({}, config);
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
      if (cfg.filters_enabled !== false) {
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
          </div>
        `;
      }
      let searchHtml = '';
      if (cfg.search_enabled !== false) {
        searchHtml += `
          <div id="search" style="padding: 10px; display: flex; align-items: center; gap: 8px;">
            <label style="flex: 1;">Name
              <div class="name-wrapper" style="display: flex; position: relative;">
                <input id="filter-name" type="text" placeholder="Search by name..." style="width: 100%;" />
                <button id="clear-name" type="button" style="display:none">Clear</button>
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
            ${(cfg.filters_enabled !== false || cfg.search_enabled !== false) ? '<button id="clear-filters">Clear Filters</button>' : ''}
            ${cfg.csv_enabled === false ? '' : '<button id="export-csv">Export to CSV</button>'}
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
        if (cfg.color === 'Accent color') headerColor = 'var(--accent-color, var(--primary-color))';
        else if (cfg.color === 'Primary color' || cfg.color === 'State color (default)') headerColor = 'var(--primary-color)';
        else if (cfg.color === 'None') headerColor = 'transparent';
        else if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(cfg.color)) headerColor = cfg.color;
        else headerColor = cfg.color; // fallback: maybe a css variable name
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
      if (cfg.search_enabled !== false && saved.name) {
        const nameEl = this.shadowRoot.getElementById('filter-name');
        if (nameEl) nameEl.value = saved.name;
      }
    
      // Add sorting listeners to header elements (use data-idx to reference original column index)
      const headers = root.querySelectorAll('th');
      headers.forEach((header) => {
        header.onclick = () => {
          try {
            // respect global sorting enabled flag
            if (cfg.sorting_enabled === false) return;

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
      elem.onclick = this.tbl.cfg.clickable
        ? function (clk_ev) {
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
          }
        : null;
    });
  }

    applySorting(rows) {
      // Respect global sorting_enabled flag on the card
      if (this._config && this._config.sorting_enabled === false) return rows;

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
        const rawRows = devices.map(
          (device) => new DataRowZHA({ attributes: device }, config.strict)
        );
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
    
          el.addEventListener("change", () => {
            this.applyFilters();
            this._saveFilterState();
          });
    
          if (id === "filter-name") {
            el.addEventListener("input", () => {
              this.applyFilters();
              this._saveFilterState();
            });
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
        const clearButton = root.getElementById("clear-filters");
        if (clearButton) {
          clearButton.addEventListener("click", () => {
            ["filter-area", "filter-model", "filter-type", "filter-online", "filter-name"].forEach((id) => {
              const el = root.getElementById(id);
              if (el) {
                el.value = "";
                el.classList.remove("filter-active");
              }
            });
            sessionStorage.removeItem("zha_card_filters");
            this.applyFilters();
          });
        }
        
        // Clear "name" text input (× button)
        const clearNameBtn = root.getElementById("clear-name");
        if (clearNameBtn) {
          clearNameBtn.addEventListener("click", () => {
            const nameInput = root.getElementById("filter-name");
            if (nameInput) {
              nameInput.value = "";
              nameInput.classList.remove("filter-active");
              this._saveFilterState();
              this.applyFilters();
            }
          });
        }
        
        // Handle CSV export (only when enabled)
        const exportBtn = root.getElementById("export-csv");
        if (exportBtn) {
          exportBtn.onclick = () => {
            if (cfg.csv_enabled === false) return;
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
        }
      });
    }

  _setCardSize(num_rows) {
    this.card_height = parseInt(num_rows * 0.5);
  }

  getCardSize() {
    return this.card_height;
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