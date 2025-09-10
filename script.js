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
  this._div.innerHTML = `<strong>Clicked:</strong><br/><pre>${JSON.stringify(clickCoords, null, 2)}</pre>`;
};
clickedCoordsBox.addTo(map);

// ---- Buttons Control ----
const buttonsControl = L.control({ position: "topleft" });
buttonsControl.onAdd = function () {
  const container = L.DomUtil.create("div", "info button-box");

  // Add buttons
  const clearBtn = document.createElement("button");
  clearBtn.id = "clearBtn";
  clearBtn.textContent = "Clear";
  clearBtn.onclick = e => {
    L.DomEvent.stopPropagation(e); // Prevent map click
    clickCoords = [];
    clickMarkers.clearLayers();
    clickedCoordsBox.update();
  };

  const copyBtn = document.createElement("button");
  copyBtn.id = "copyBtn";
  copyBtn.textContent = "Copy";
  copyBtn.onclick = e => {
    L.DomEvent.stopPropagation(e); // Prevent map click
    navigator.clipboard.writeText(JSON.stringify(clickCoords))
      .then(() => alert("Coordinates copied to clipboard!"))
      .catch(err => console.error("Copy failed", err));
  };

  container.appendChild(clearBtn);
  container.appendChild(copyBtn);
  return container;
};
buttonsControl.addTo(map);

// ---- Map Click Handler ----
map.on("click", e => {
  const point = [+e.latlng.lng.toFixed(6), +e.latlng.lat.toFixed(6)];
  clickCoords.push(point);
  clickedCoordsBox.update();
  L.circleMarker(e.latlng, { radius: 4, color: "red" }).addTo(clickMarkers);
});

// ---- Fetch Data + Build Layers by Category ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    const categoryGroups = {}; // {Catégorie: {Nom: layer}}
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
      if (color.startsWith('"') && color.endsWith('"')) color = color.slice(1, -1);
      if (color && color[0] !== "#") color = "#" + color;
      if (!/^#([0-9A-F]{6})$/i.test(color)) color = "#3388ff";

      const categoryName = (item.categorie || "").trim();
      const nomName = (item.nom || "").trim();
      if (!categoryName || !nomName) return;

      const nomLayer = L.geoJSON(combined, {
        color: color,
        fillColor: color,
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(
        `<strong>${item.nom}</strong><br/>Plancher: ${item.plancher}<br/>Plafond: ${item.plafond}`,
        { sticky: true }
      );

      if (!categoryGroups[categoryName]) categoryGroups[categoryName] = {};
      categoryGroups[categoryName][nomName] = nomLayer;
    });

    // ---- Leaflet Panel Layers Menu ----
    const baseLayers = {};
    const groupedOverlays = Object.keys(categoryGroups).map(cat => ({
      group: cat,
      layers: Object.entries(categoryGroups[cat]).map(([nom, layer]) => ({
        name: nom,
        layer: layer
      }))
    }));

    const panelLayers = new L.Control.PanelLayers(baseLayers, groupedOverlays, {
      collapsibleGroups: true,
      collapsed: false
    });
    map.addControl(panelLayers);

    // Fit map to all features
    if (allFeatures.length > 0) {
      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  })
  .catch(err => console.error("Error fetching data:", err));

// ---- Build Feature from JSON string and normalize numbers ----
function buildFeature(obj) {
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;

    function normalizeCoords(coords) {
      return coords.map(c => {
        if (Array.isArray(c[0])) return normalizeCoords(c);
        return c.map(Number);
      });
    }

    if (Array.isArray(parsed)) {
      const coords = normalizeCoords(parsed);
      // Single coordinate = point
      if (coords.length === 1 && coords[0].length === 2) return turf.point(coords[0]);
      // Line if multiple coords and not closed
      if (coords.length > 1 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
        return turf.lineString(coords);
      }
      return turf.polygon(coords);
    }

    if (parsed.center && parsed.radius) {
      return turf.circle(parsed.center.map(Number), parsed.radius, parsed.options || {});
    }
  } catch (err) {
    console.warn("Invalid geometry:", obj, err);
  }
  return null;
}
