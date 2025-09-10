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
  this._div.innerHTML = `<strong>Clicked:</strong> <pre style="max-width:60%; white-space:pre-wrap;">${JSON.stringify(clickCoords, null, 2)}</pre>`;
};
clickedCoordsBox.addTo(map);

// ---- Buttons ----
const clearBtn = L.DomUtil.create("button", "", document.body);
clearBtn.id = "clearBtn";
clearBtn.innerText = "Clear";
const copyBtn = L.DomUtil.create("button", "", document.body);
copyBtn.id = "copyBtn";
copyBtn.innerText = "Copy";

L.DomEvent.on(clearBtn, 'click', e => {
  L.DomEvent.stopPropagation(e);
  clickCoords = [];
  clickMarkers.clearLayers();
  clickedCoordsBox.update();
});
L.DomEvent.on(copyBtn, 'click', e => {
  L.DomEvent.stopPropagation(e);
  navigator.clipboard.writeText(JSON.stringify(clickCoords))
    .then(() => alert("Coordinates copied!"))
    .catch(err => console.error(err));
});

// ---- Fetch Data + Build Features ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    const categoryGroups = {}; // {Catégorie: {Nom: layer}}
    let allFeatures = [];

    data.forEach(item => {
      const pairs = [[item.p1, item.intp1],[item.p2,item.intp2],[item.p3,item.intp3],[item.p4,item.intp4]];

      let combined = null;

      pairs.forEach(([geom, intGeom]) => {
        if (!geom) return;

        let feature = parseGeometry(geom);
        if (!feature) return;

        if (intGeom) {
          let intFeature = parseGeometry(intGeom);
          if (intFeature) {
            try { 
              const intersection = turf.intersect(feature, intFeature);
              if (intersection) feature = intersection;
            } catch(e) { console.warn("Intersection failed", e); }
          }
        }

        if (!combined) combined = feature;
        else {
          try { combined = turf.union(combined, feature); } 
          catch(e) { console.warn("Union failed", e); }
        }
      });

      if (!combined) return;
      allFeatures.push(combined);

      // Normalize color
      let color = (item.couleur || "").trim();
      if (color && color[0]!=="#") color = "#" + color;
      if (!/^#([0-9A-F]{6})$/i.test(color)) color = "#3388ff";

      const category = (item.categorie||"").trim();
      const nom = (item.nom||"").trim();
      if (!category || !nom) return;

      const layer = L.geoJSON(combined, {color, fillColor: color, weight:2, fillOpacity:0.3})
        .bindTooltip(`<strong>${nom}</strong><br>Plancher: ${item.plancher}<br>Plafond: ${item.plafond}`, {sticky:true});

      if (!categoryGroups[category]) categoryGroups[category] = {};
      categoryGroups[category][nom] = layer;
    });

    // ---- Build Leaflet Panel Layers ----
    const overlays = [];
    Object.entries(categoryGroups).forEach(([cat, nomLayers]) => {
      const layersArray = Object.entries(nomLayers).map(([nom, layer]) => ({name: nom, layer}));
      overlays.push({group: cat, layers: layersArray});
    });

    const panelLayers = new L.Control.PanelLayers(null, overlays, {collapsibleGroups:true});
    map.addControl(panelLayers);

    // ---- Fit map to all features ----
    if (allFeatures.length>0){
      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }
  })
  .catch(err => console.error("Error fetching data:", err));

// ---- Universal Geometry Parser ----
function parseGeometry(obj){
  if (!obj) return null;

  try {
    const parsed = typeof obj==="string" ? JSON.parse(obj) : obj;

    // Circle
    if (parsed.center && parsed.radius) return turf.circle(parsed.center, parsed.radius, parsed.options||{});

    // Array
    if (Array.isArray(parsed)){
      // Single point
      if (parsed.length===2 && typeof parsed[0]==="number" && typeof parsed[1]==="number")
        return turf.point(parsed);

      // Line or polygon
      if (parsed.length>1 && Array.isArray(parsed[0])){
        const first = parsed[0], last = parsed[parsed.length-1];
        const isPolygon = first[0]===last[0] && first[1]===last[1];
        if (isPolygon) return turf.polygon([parsed]);
        return turf.lineString(parsed);
      }
    }
  } catch(e){
    console.warn("Invalid geometry:", obj, e);
  }

  return null;
}
