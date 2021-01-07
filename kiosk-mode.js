const ha = document.querySelector("home-assistant");
const main = ha.shadowRoot.querySelector("home-assistant-main").shadowRoot;
const panel = main.querySelector("partial-panel-resolver");
const drawerLayout = main.querySelector("app-drawer-layout");
let llAttempts = 0;
let config = {};
window.kiosk_entities = [];

function run() {
  const lovelace = main.querySelector("ha-panel-lovelace");
  if (queryString("disable_km") || !lovelace) return;
  getConfig(lovelace);
}

function getConfig(lovelace) {
  llAttempts++;
  try {
    const llConfig = lovelace.lovelace.config;
    config = llConfig.kiosk_mode || {};
    kiosk_mode(lovelace);
  } catch {
    if (llAttempts < 40) setTimeout(() => getConfig(), 50);
  }
}

// Return true if any keyword is found in query strings.
function queryString(keywords) {
  if (!Array.isArray(keywords)) keywords = [keywords];
  return keywords.some((x) => window.location.search.includes(x));
}

// Set localStorage item.
function setCache(k, v) {
  window.localStorage.setItem(k, v);
}

// Retrieve localStorage item as bool.
function cached(k) {
  return window.localStorage.getItem(k) == "true";
}

// Check if element and style element exist.
function styleExists(elem) {
  return elem.querySelector("#kiosk_mode_" + elem.localName);
}

// Insert style element.
function addStyle(css, elem) {
  if (!styleExists(elem)) {
    const style = document.createElement("style");
    style.setAttribute("id", "kiosk_mode_" + elem.localName);
    style.innerHTML = css;
    elem.appendChild(style);
  }
}

// Remove style element.
function removeStyle(elem) {
  if (styleExists(elem)) elem.querySelector("#kiosk_mode_" + elem.localName).remove();
}

function kiosk_mode(lovelace) {
  llAttempts = 0;
  const hass = ha.hass;
  const huiRoot = lovelace.shadowRoot.querySelector("hui-root").shadowRoot;
  const toolbar = huiRoot.querySelector("app-toolbar");
  const adminConf = config.admin_settings;
  const nonAdminConf = config.non_admin_settings;
  const entityConf = config.entity_settings;
  let userConf = config.user_settings;

  // Retrieve localStorage values & query string options.
  let hide_header = cached("kmHeader") || queryString(["kiosk", "hide_header"]);
  let hide_sidebar = cached("kmSidebar") || queryString(["kiosk", "hide_sidebar"]);
  const queryStringsSet = hide_sidebar || hide_header;

  // Use config values only if config strings and cache aren't used.
  hide_header = queryStringsSet ? hide_header : config.kiosk || config.hide_header;
  hide_sidebar = queryStringsSet ? hide_sidebar : config.kiosk || config.hide_sidebar;

  if (adminConf && hass.user.is_admin) {
    hide_header = adminConf.kiosk || adminConf.hide_header;
    hide_sidebar = adminConf.kiosk || adminConf.hide_sidebar;
  }

  if (nonAdminConf && !hass.user.is_admin) {
    hide_header = nonAdminConf.kiosk || nonAdminConf.hide_header;
    hide_sidebar = nonAdminConf.kiosk || nonAdminConf.hide_sidebar;
  }

  if (entityConf) {
    for (let ent of entityConf) {
      const entity = Object.keys(ent.entity)[0];
      const state = ent.entity[entity];
      if (!window.kiosk_entities.includes(entity)) window.kiosk_entities.push(entity);
      if (hass.states[entity].state == state) {
        if ("kiosk" in ent) {
          hide_header = ent.kiosk;
          hide_sidebar = ent.kiosk;
        } else {
          if ("hide_header" in ent) hide_header = ent.hide_header;
          if ("hide_sidebar" in ent) hide_sidebar = ent.hide_sidebar;
        }
      }
    }
  }

  if (userConf) {
    if (!Array.isArray(userConf)) userConf = [userConf];
    for (let conf of userConf) {
      let users = conf.users;
      if (!Array.isArray(users)) users = [users];
      if (users.some((x) => x.toLowerCase() == hass.user.name.toLowerCase())) {
        hide_header = conf.kiosk || conf.hide_header;
        hide_sidebar = conf.kiosk || conf.hide_sidebar;
      }
    }
  }

  if (hide_header) {
    addStyle("#view { min-height: 100vh !important } app-header { display: none }", huiRoot);
    if (queryString("cache")) setCache("kmHeader", "true");
  }

  if (hide_sidebar) {
    addStyle(":host { --app-drawer-width: 0 !important } #drawer { display: none }", drawerLayout);
    addStyle("ha-menu-button { display:none !important } ", toolbar);
    if (queryString("cache")) setCache("kmSidebar", "true");
  }

  if (!hide_header) removeStyle(huiRoot);
  if (!hide_sidebar) removeStyle(toolbar);
  if (!hide_sidebar) removeStyle(drawerLayout);

  window.dispatchEvent(new Event("resize"));
}

// Clear cache if requested.
if (queryString("clear_km_cache")) ["kmHeader", "kmSidebar"].forEach((k) => setCache(k, "false"));

// Initial run.
run();

// Run on entity state change events.
window.hassConnection.then(
  ({ conn }) =>
    (conn.socket.onmessage = (e) => {
      if (window.kiosk_entities.length < 1) return;
      const event = JSON.parse(e.data).event;
      if (
        event &&
        event.event_type == "state_changed" &&
        window.kiosk_entities.includes(event.data.entity_id) &&
        event.data.new_state.state != event.data.old_state.state
      ) {
        config = {};
        run();
      }
    })
);

// Run on element changes.
new MutationObserver(lovelaceWatch).observe(panel, { childList: true });

// If new lovelace panel was added watch for hui-root to appear.
function lovelaceWatch(mutations) {
  mutationWatch(mutations, "ha-panel-lovelace", rootWatch);
}

// When hui-root appears watch it's children.
function rootWatch(mutations) {
  mutationWatch(mutations, "hui-root", appLayoutWatch);
}

// When ha-app-layout appears we can run.
function appLayoutWatch(mutations) {
  mutationWatch(mutations, "ha-app-layout", null);
}

function mutationWatch(mutations, nodename, observeElem) {
  for (let mutation of mutations) {
    for (let node of mutation.addedNodes) {
      if (node.localName == nodename) {
        if (observeElem) {
          new MutationObserver(observeElem).observe(node.shadowRoot, {
            childList: true,
          });
        } else {
          config = {};
          run();
        }
        return;
      }
    }
  }
}

// Overly complicated console tag.
const conInfo = { header: "%c≡ kiosk-mode".padEnd(27), ver: "%cversion *DEV " };
const br = "%c\n";
const maxLen = Math.max(...Object.values(conInfo).map((el) => el.length));
for (const [key] of Object.entries(conInfo)) {
  if (conInfo[key].length <= maxLen) conInfo[key] = conInfo[key].padEnd(maxLen);
  if (key == "header") conInfo[key] = `${conInfo[key].slice(0, -1)}⋮ `;
}
const header =
  "display:inline-block;border-width:1px 1px 0 1px;border-style:solid;border-color:#424242;color:white;background:#03a9f4;font-size:12px;padding:4px 4.5px 5px 6px;";
const info = "border-width:0px 1px 1px 1px;padding:7px;background:white;color:#424242;line-height:0.7;";
console.info(conInfo.header + br + conInfo.ver, header, "", `${header} ${info}`);
