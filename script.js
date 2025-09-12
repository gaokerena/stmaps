const scriptURL = "https://script.google.com/macros/s/AKfycbxqeaRLtaxBI7-VLT2nox7QhRbz2EFIcN3kcHMC11R6I0HHFH8LgwUgaF736iPc5Pm8/exec";

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
  this._div.innerHTML = `<strong>Clicked:</strong> <pre>${JSON.stringify(clickCoords, null, 2)}</pre>`;
};
clickedCoordsBox.addTo(map);

// ---- Buttons ----
const buttonBox = L.control({ position: "topleft" });
buttonBox.onAdd = function () {
  const div = L.DomUtil.create("div", "info button-box");
  div.innerHTML = `
    <button id="clearBtn">Clear</button>
    <button id="copyBtn">Copy</button>
  `;
  div.querySelectorAll("button").forEach(btn => btn.addEventListener("click", e => e.stopPropagation()));
  return div;
};
buttonBox.addTo(map);

document.getElementById("clearBtn").addEventListener("click", () => {
  clickCoords = [];
  clickMarkers.clearLayers();
  clickedCoordsBox.update();
});

document.getElementById("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(JSON.stringify(clickCoords, null, 2))
    .then(() => alert("Coordinates copied!"))
    .catch(err => console.error(err));
});

map.on("click", e => {
  clickCoords.push([e.latlng.lng, e.latlng.lat]);
  L.marker(e.latlng).addTo(clickMarkers);
  clickedCoordsBox.update();
});

// ---- Fetch Data & Build Features ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    if (!Array.isArray(data) || data.length === 0) {
      alert("No data available to display.");
      return;
    }

    const categoryGroups = {}; // group by categorie
    const coucheGroups = {};   // group layers by couche

    data.forEach(item => {
      const quads = [
        [item.p1, item.intp1, item.exp1],
        [item.p2, item.intp2, item.exp2],
        [item.p3, item.intp3, item.exp3],
        [item.p4, item.intp4, item.exp4]
      ];

      let combined = null;

      quads.forEach(([geom, intGeom, expGeom]) => {
        if (!geom) return;
        let feature = parseGeometry(geom);
        if (!feature) return;

        if (intGeom) {
          const intFeature = parseGeometry(intGeom);
          if (intFeature) {
            try {
              const intersection = turf.intersect(feature, intFeature);
              if (intersection) feature = intersection;
            } catch (e) { console.warn("Intersection failed", e); }
          }
        }

        if (expGeom) {
          const expFeature = parseGeometry(expGeom);
          if (expFeature) {
            try {
              const diff = turf.difference(feature, expFeature);
              if (diff) feature = diff;
              else return;
            } catch (e) { console.warn("Difference failed", e); }
          }
        }

        if (!combined) combined = feature;
        else {
          try {
            combined = turf.union(combined, feature);
          } catch (e) { console.warn("Union failed", e); }
        }
      });

      if (!combined) return;

      let color = (item.couleur || "").trim();
      if (color && color[0] !== "#") color = "#" + color;
      if (!/^#([0-9A-F]{6})$/i.test(color)) color = "#3388ff";

      const category = (item.categorie || "").trim();
      const couche = (item.couche || "Default").trim();
      const nom = (item.nom || "Shape").trim();
      if (!category) return;

      const layer = L.geoJSON(combined, {
        color,
        fillColor: color,
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(
        `<strong>${nom}</strong><br>Plancher: ${item.plancher}<br>Plafond: ${item.plafond}`,
        { sticky: true }
      );

      // Group by category
      if (!categoryGroups[category]) categoryGroups[category] = {};
      // Group by couche (layer name)
      if (!categoryGroups[category][couche]) categoryGroups[category][couche] = [];
      categoryGroups[category][couche].push(layer);
    });

    // ---- Build Panel Layers ----
    const overlays = [];
    Object.entries(categoryGroups).forEach(([cat, coucheLayers]) => {
      const layersArray = Object.entries(coucheLayers).map(([couche, shapes]) => {
        const groupLayer = L.layerGroup(shapes);
        return { name: couche, layer: groupLayer };
      });
      overlays.push({ group: cat, layers: layersArray });
    });

    const panelLayers = new L.Control.PanelLayers(null, overlays, { collapsibleGroups: true, collapsed: true });
    map.addControl(panelLayers);
  })
  .catch(err => {
    console.error("Error fetching data:", err);
    alert("Failed to load map data.");
  });

// ---- Universal Geometry Parser ----
function parseGeometry(obj) {
  if (!obj) return null;
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;
    if (parsed.center && parsed.radius)
      return turf.circle(parsed.center, parsed.radius, parsed.options || {});

    if (Array.isArray(parsed)) {
      if (parsed.length === 2 && typeof parsed[0] === "number" && typeof parsed[1] === "number")
        return turf.point(parsed);

      if (parsed.length > 1 && Array.isArray(parsed[0])) {
        const first = parsed[0], last = parsed[parsed.length - 1];
        if (first[0] === last[0] && first[1] === last[1])
          return turf.polygon([parsed]);
        return turf.lineString(parsed);
      }
    }
  } catch (e) { console.warn("Invalid geometry:", obj, e); }
  return null;
}
