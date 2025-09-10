const scriptURL = "https://script.google.com/macros/s/AKfycbxHz5OBOFSrpRUZlKqL_5h-yk3jVJkW9wrKd2YXUm7Of-iRzY0zitxt_LGNj7jXifAW/exec";

const map = L.map('map').setView([48.5, 7.5], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

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
map.on("mousemove", (e) => mouseCoordsBox.update(e.latlng));

// ---- Clicked Coordinates Box ----
const clickedCoordsBox = L.control({ position: "bottomright" });
clickedCoordsBox.onAdd = function () {
  this._div = L.DomUtil.create("div", "info clicked-coords");
  this.update();
  return this._div;
};
clickedCoordsBox.update = function () {
  this._div.innerHTML = `
    <strong>Clicked:</strong><br/>
    <pre>${JSON.stringify(clickCoords, null, 2)}</pre>
  `;
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

map.on("click", (e) => {
  const point = [+e.latlng.lng.toFixed(6), +e.latlng.lat.toFixed(6)];
  clickCoords.push(point);
  clickedCoordsBox.update();

  // Add a marker for visual feedback
  L.circleMarker(e.latlng, { radius: 4, color: "red" }).addTo(clickMarkers);
});

// ---- Button Event Listeners ----
document.addEventListener("click", (e) => {
  if (e.target.id === "clearBtn") {
    clickCoords = [];
    clickMarkers.clearLayers();
    clickedCoordsBox.update();
  }
  if (e.target.id === "copyBtn") {
    navigator.clipboard.writeText(JSON.stringify(clickCoords))
      .then(() => alert("Coordinates copied to clipboard!"))
      .catch(err => console.error("Copy failed", err));
  }
});

// ---- Fetch Data + Build Layer Groups ----
fetch(scriptURL)
  .then(response => response.json())
  .then(data => {
    const categoryGroups = {}; // Catégorie => LayerGroup
    let allFeatures = [];

    data.forEach(item => {
      // Build unioned geometry for this Nom
      const pairs = [
        [item.p1, item.intp1],
        [item.p2, item.intp2],
        [item.p3, item.intp3],
        [item.p4, item.intp4]
      ];

      let combined = null;
      pairs.forEach(([p, intp]) => {
        if (!p) return;
        const featureP = buildFeature(p);
        const featureInt = intp ? buildFeature(intp) : null;
        if (!featureP) return;

        let currentShape = featureP;
        if (featureInt) {
          try {
            const inter = turf.intersect(featureP, featureInt);
            if (inter) currentShape = inter;
            else return;
          } catch (e) { return; }
        }

        if (!combined) combined = currentShape;
        else {
          try {
            combined = turf.union(combined, currentShape);
          } catch (e) { console.warn("Union failed:", e); }
        }
      });

      if (!combined) return;

      allFeatures.push(combined);

      // Create individual layer for Nom
      const nomLayer = L.geoJSON(combined, {
        color: item.couleur || "#3388ff",
        fillColor: item.couleur || "#3388ff",
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(
        `<strong>${item.nom}</strong><br/>
         Plancher: ${item.plancher}<br/>
         Plafond: ${item.plafond}`,
        { sticky: true }
      );

      // Add Nom layer to the correct Catégorie group
      if (!categoryGroups[item.categorie]) {
        categoryGroups[item.categorie] = L.layerGroup();
      }
      categoryGroups[item.categorie].addLayer(nomLayer);
    });

    // Add LayerGroups to map + Layer Control
    const overlays = {};
    Object.entries(categoryGroups).forEach(([cat, group]) => {
      group.addTo(map);
      overlays[cat] = group;
    });

    L.control.layers(null, overlays, { collapsed: false }).addTo(map);

    // Fit map to all features
    if (allFeatures.length > 0) {
      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  })
  .catch(err => console.error("Error fetching data:", err));

function buildFeature(obj) {
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;
    if (Array.isArray(parsed)) return turf.polygon(parsed);
    if (parsed.center && parsed.radius) return turf.circle(parsed.center, parsed.radius, parsed.options);
  } catch (e) {
    console.warn("Invalid geometry:", obj, e);
  }
  return null;
}
