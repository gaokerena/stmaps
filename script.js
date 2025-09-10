const scriptURL = "https://script.google.com/macros/s/AKfycbxHz5OBOFSrpRUZlKqL_5h-yk3jVJkW9wrKd2YXUm7Of-iRzY0zitxt_LGNj7jXifAW/exec";

const map = L.map('map').setView([48.5, 7.5], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

let clickCoords = [];
let clickMarkers = L.layerGroup().addTo(map);

// ---- Mouse Coordinates Box ----
const mouseCoordsBox = L.control({ position: "bottomleft" });
mouseCoordsBox.onAdd = function () {
  this._div = L.DomUtil.create("div", "info mouse-coords");
  this.update();
  return this._div;
};
mouseCoordsBox.update = function (latlng) {
  this._div.innerHTML = latlng
    ? `<strong>Mouse:</strong> [${latlng.lng.toFixed(6)}, ${latlng.lat.toFixed(6)}]`
    : `<strong>Mouse:</strong> Move over map`;
};
mouseCoordsBox.addTo(map);
map.on("mousemove", e => mouseCoordsBox.update(e.latlng));

// ---- Clicked Coordinates Box ----
const clickedCoordsBox = L.control({ position: "bottomright" });
clickedCoordsBox.onAdd = function () {
  this._div = L.DomUtil.create("div", "info clicked-coords");
  this.update();
  return this._div;
};
clickedCoordsBox.update = function () {
  const htmlCoords = clickCoords.map(c => `[${c[0]}, ${c[1]}]`).join(' ');
  this._div.innerHTML = `<strong>Clicked:</strong><br/><pre style="white-space: normal; max-width: 60%;">${htmlCoords}</pre>`;
};
clickedCoordsBox.addTo(map);

// ---- Buttons Control ----
const buttonsControl = L.control({ position: "topleft" });
buttonsControl.onAdd = function () {
  const container = L.DomUtil.create("div", "info button-box");
  container.innerHTML = `
    <button id="clearBtn">Clear</button>
    <button id="copyBtn">Copy</button>
  `;
  return container;
};
buttonsControl.addTo(map);

// ---- Button Event Listeners ----
document.getElementById("clearBtn").addEventListener("click", e => {
  L.DomEvent.stopPropagation(e);
  clickCoords = [];
  clickMarkers.clearLayers();
  clickedCoordsBox.update();
});

document.getElementById("copyBtn").addEventListener("click", e => {
  L.DomEvent.stopPropagation(e);
  navigator.clipboard.writeText(JSON.stringify(clickCoords))
    .then(() => alert("Coordinates copied to clipboard!"))
    .catch(err => console.error("Copy failed", err));
});

// ---- Map Click Handler ----
map.on("click", e => {
  const point = [+e.latlng.lng.toFixed(6), +e.latlng.lat.toFixed(6)];
  clickCoords.push(point);
  clickedCoordsBox.update();

  L.circleMarker(e.latlng, { radius: 4, color: "red" }).addTo(clickMarkers);
});

// ---- Fetch Data and Build Layer Groups ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    const groupedLayers = {}; // {Catégorie: {Nom: layer, ...}, ...}
    let allFeatures = [];

    data.forEach(item => {
      const pairs = [
        [item.p1, item.intp1],
        [item.p2, item.intp2],
        [item.p3, item.intp3],
        [item.p4, item.intp4]
      ];

      let combined = null;
      pairs.forEach(([p, intp]) => {
        if (!p) return;

        let featureP = buildFeature(p);
        if (featureP) featureP = turf.rewind(featureP, { reverse: false });
        let featureInt = intp ? buildFeature(intp) : null;
        if (featureInt) featureInt = turf.rewind(featureInt, { reverse: false });

        if (!featureP) return;

        let currentShape = featureP;
        if (featureInt) {
          try {
            const inter = turf.intersect(featureP, featureInt);
            if (inter) currentShape = inter;
            else return;
          } catch (err) { return; }
        }

        if (!combined) combined = currentShape;
        else {
          try { combined = turf.union(combined, currentShape); }
          catch (err) { console.warn("Union failed:", err); }
        }
      });

      if (!combined) return;
      allFeatures.push(combined);

      // Normalize color
      let color = (item.couleur || "").trim();
      if (color && color[0] !== "#") color = "#" + color;
      if (!/^#([0-9A-F]{6})$/i.test(color)) color = "#3388ff";

      const cat = (item.categorie || "").trim();
      const nom = (item.nom || "").trim();
      if (!cat || !nom) return;

      const layer = L.geoJSON(combined, {
        color: color,
        fillColor: color,
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(
        `<strong>${item.nom}</strong><br/>Plancher: ${item.plancher}<br/>Plafond: ${item.plafond}`,
        { sticky: true }
      );

      if (!groupedLayers[cat]) groupedLayers[cat] = {};
      groupedLayers[cat][nom] = layer;
    });

    // ---- Add grouped layer control (collapsible categories inside Leaflet menu) ----
    L.control.groupedLayers(null, groupedLayers, { collapsed: true }).addTo(map);

    // Fit map to all features
    if (allFeatures.length > 0) {
      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  })
  .catch(err => console.error("Error fetching data:", err));

// ---- Build Feature from JSON string ----
function buildFeature(obj) {
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;

    // Circle
    if (parsed.center && parsed.radius) return turf.circle(parsed.center, parsed.radius, parsed.options);

    // Array of coordinates
    if (Array.isArray(parsed)) {
      // Single coordinate → Point
      if (parsed.length === 1 && Array.isArray(parsed[0]) && parsed[0].length === 2) {
        return turf.point(parsed[0]);
      }

      // Handle possible nested polygon array
      const coords = parsed[0] && Array.isArray(parsed[0][0]) ? parsed[0] : parsed;

      // Closed polygon (first = last)
      if (coords.length > 2 && coords[0][0] === coords[coords.length-1][0] && coords[0][1] === coords[coords.length-1][1]) {
        return turf.polygon([coords]);
      }

      // Otherwise treat as LineString
      return turf.lineString(coords);
    }
  } catch (err) {
    console.warn("Invalid geometry:", obj, err);
  }
  return null;
}
