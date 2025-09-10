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
  // Remove outer brackets
  const stripped = JSON.stringify(clickCoords).replace(/^\[|\]$/g, '');
  this._div.innerHTML = `<strong>Clicked:</strong> <pre style="white-space: pre-wrap; max-width:60%;">${stripped}</pre>`;
};
clickedCoordsBox.addTo(map);

// ---- Buttons ----
const clearBtn = L.DomUtil.create('button', '');
clearBtn.textContent = 'Clear';
clearBtn.onclick = e => {
  L.DomEvent.stopPropagation(e);
  clickCoords = [];
  clickMarkers.clearLayers();
  clickedCoordsBox.update();
};
const copyBtn = L.DomUtil.create('button', '');
copyBtn.textContent = 'Copy';
copyBtn.onclick = e => {
  L.DomEvent.stopPropagation(e);
  navigator.clipboard.writeText(JSON.stringify(clickCoords))
    .then(() => alert("Coordinates copied!"))
    .catch(err => console.error("Copy failed", err));
};
const buttonsContainer = L.control({ position: "topleft" });
buttonsContainer.onAdd = function () {
  const div = L.DomUtil.create("div", "info button-box");
  div.appendChild(clearBtn);
  div.appendChild(copyBtn);
  return div;
};
buttonsContainer.addTo(map);

// ---- Map click handler ----
map.on("click", e => {
  const point = [+e.latlng.lng.toFixed(6), +e.latlng.lat.toFixed(6)];
  clickCoords.push(point);
  clickedCoordsBox.update();
  L.circleMarker(e.latlng, { radius: 4, color: "red" }).addTo(clickMarkers);
});

// ---- Fetch data + build layers ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    const categoryGroups = {};
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
        let featureInt = intp ? buildFeature(intp) : null;

        if (!featureP) return;
        let currentShape = featureP;

        if (featureInt) {
          try {
            const inter = turf.intersect(featureP, featureInt);
            if (inter) currentShape = inter;
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

      const categoryName = item.categorie || "Unknown";
      const nomName = item.nom || "Layer";

      if (!categoryGroups[categoryName]) categoryGroups[categoryName] = {};
      const layer = L.geoJSON(combined, {
        color: color,
        fillColor: color,
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(`<strong>${item.nom}</strong><br/>Plancher: ${item.plancher}<br/>Plafond: ${item.plafond}`, { sticky: true });

      categoryGroups[categoryName][nomName] = layer;
    });

    // ---- Panel layers ----
    const baseLayers = {};
    const overlays = Object.entries(categoryGroups).map(([cat, layers]) => ({
      group: cat,
      layers: Object.entries(layers).map(([name, layer]) => ({ name, layer }))
    }));
    new L.Control.PanelLayers(baseLayers, overlays, { collapsibleGroups: true }).addTo(map);

    // Fit map
    if (allFeatures.length > 0) {
      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);
      if (bbox.every(n => typeof n === "number")) map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  })
  .catch(err => console.error("Error fetching data:", err));

// ---- Build feature with auto-wrapping ----
function buildFeature(obj) {
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;

    // Circle
    if (parsed.center && parsed.radius) return turf.circle(parsed.center, parsed.radius, parsed.options);

    // Array of coordinates
    if (Array.isArray(parsed)) {
      if (parsed.length === 1 || (parsed[0].length === 2 && parsed.length === 1)) {
        // Single point
        return turf.point(parsed[0]);
      } else if (parsed[0].length === 2 && parsed[parsed.length-1][0] !== parsed[0][0] || parsed[parsed.length-1][1] !== parsed[0][1]) {
        // Line
        return turf.lineString(parsed);
      } else {
        // Polygon
        const poly = Array.isArray(parsed[0][0]) ? parsed : [parsed];
        return turf.polygon(poly);
      }
    }
  } catch (err) {
    console.warn("Invalid geometry:", obj, err);
  }
  return null;
}
