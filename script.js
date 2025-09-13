const scriptURL = "https://script.google.com/macros/s/AKfycbxqeaRLtaxBI7-VLT2nox7QhRbz2EFIcN3kcHMC11R6I0HHFH8LgwUgaF736iPc5Pm8/exec";

const map = L.map('map').setView([48.5, 7.5], 8);

// ---- Base Tiles ----
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// ---- White Overlay Above Tiles ----
const whiteOverlay = L.rectangle([[-90,-180],[90,180]], {
  color: '#ffffff',
  weight: 0,
  fillOpacity: 0.3,
  interactive: false
}).addTo(map);

// ---- Overlay Opacity Slider (top-right) ----
const sliderDiv = document.createElement('div');
sliderDiv.id = 'overlayControl';
sliderDiv.innerHTML = `
  <label for="opacitySlider">Overlay Opacity:</label>
  <input type="range" id="opacitySlider" min="0" max="1" step="0.01" value="0.3">
  <span id="opacityValue">30%</span>
`;
document.body.appendChild(sliderDiv);

const opacitySlider = document.getElementById('opacitySlider');
const opacityValue = document.getElementById('opacityValue');
opacitySlider.addEventListener('input', e => {
  const value = parseFloat(e.target.value);
  whiteOverlay.setStyle({ fillOpacity: value });
  opacityValue.innerText = `${Math.round(value*100)}%`;
});

// ---- Click Coordinates & Markers ----
let clickCoords = [];
let clickMarkers = L.layerGroup().addTo(map);

// ---- Controls below map (draw type + clicked coordinates + buttons) ----
const controlsContainer = document.createElement('div');
controlsContainer.id = 'map-controls';
controlsContainer.innerHTML = `
  <select id="drawTypeSelect">
    <option value="">Select Draw Type</option>
    <option value="marker">Point</option>
    <option value="polyline">Ligne</option>
    <option value="polygon">Polygone</option>
    <option value="circle">Cercle</option>
  </select>
  <div id="clickedCoordsBox" class="clicked-coords"></div>
  <button id="clearBtn">Clear</button>
  <button id="copyBtn">Copy</button>
`;
document.body.appendChild(controlsContainer);

const clickedCoordsBox = document.getElementById("clickedCoordsBox");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const drawTypeSelect = document.getElementById("drawTypeSelect");

// Update clicked coordinates display
function updateClickedCoords() {
  const inlineCoords = clickCoords
    .map(coord => {
      if (!Array.isArray(coord)) return '';
      if (coord.length === 3) return `[${coord[0].toFixed(6)},${coord[1].toFixed(6)},${coord[2].toFixed(2)}nm]`;
      return `[${coord.map(c => c.toFixed(6)).join(',')}]`;
    })
    .join(', ');
  clickedCoordsBox.innerHTML = `<strong>Clicked:</strong> ${inlineCoords}`;
}

clearBtn.addEventListener('click', () => {
  clickCoords = [];
  clickMarkers.clearLayers();
  drawnItems.clearLayers();
  updateClickedCoords();
});

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(JSON.stringify(clickCoords,null,2))
    .then(() => alert("Coordinates copied!"))
    .catch(err => console.error(err));
});

map.on("click", e => {
  if (!drawnItems) return;
  clickCoords.push([e.latlng.lng, e.latlng.lat]);
  L.marker(e.latlng).addTo(clickMarkers);
  updateClickedCoords();
});

// ---- Full-Screen Loading Overlay ----
const loadingOverlay = document.createElement("div");
loadingOverlay.className = "loading-overlay";
loadingOverlay.innerHTML = `
  <div class="loading-content">
    <div class="spinner"></div>
    <div class="loading-text">Loading...</div>
  </div>
`;
document.getElementById("map").appendChild(loadingOverlay);

function removeLoadingOverlay() {
  loadingOverlay.classList.add("fade-out");
  setTimeout(() => loadingOverlay.remove(), 500);
}

// ---- Mouse Coordinates Box (bottom-left) ----
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

// ---- Turf Data & Panel Layers ----
fetch(scriptURL)
  .then(resp => resp.json())
  .then(data => {
    removeLoadingOverlay();

    if (!Array.isArray(data) || data.length === 0) {
      alert("No data available to display.");
      return;
    }

    const categoryGroups = {};

    data.forEach(item => {
      const category = (item.categorie || "").trim();
      const couche = (item.couche || "Default").trim();
      const nom = (item.nom || "Shape").trim();
      let color = (item.couleur || "").trim();
      if (color && color[0] !== "#") color = "#" + color;
      if (!/^#([0-9A-F]{6})$/i.test(color)) color = "#3388ff";
      if (!category) return;

      if (category === "Navigation" && item.p1) {
        const coords = parseGeometry(item.p1);
        if (coords && coords.geometry && coords.geometry.coordinates) {
          const [lng, lat] = coords.geometry.coordinates;
          const triangleIcon = L.divIcon({
            className: 'navigation-marker',
            html: `<svg width="16" height="16" viewBox="0 0 16 16">
                     <polygon points="8,0 16,16 0,16" fill="${color}" stroke="#333" stroke-width="1"/>
                   </svg>
                   <span class="navigation-label">${nom}</span>`,
            iconSize: [120, 16],
            iconAnchor: [8, 8],
          });

          const marker = L.marker([lat, lng], { icon: triangleIcon });
          if (!categoryGroups[category]) categoryGroups[category] = {};
          if (!categoryGroups[category][couche]) categoryGroups[category][couche] = [];
          categoryGroups[category][couche].push(marker);
        }
        return;
      }

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
            try { feature = turf.intersect(feature, intFeature) || feature; }
            catch (e) { console.warn("Intersection failed", e); }
          }
        }

        if (expGeom) {
          const expFeature = parseGeometry(expGeom);
          if (expFeature) {
            try { feature = turf.difference(feature, expFeature) || feature; }
            catch (e) { console.warn("Difference failed", e); }
          }
        }

        if (!combined) combined = feature;
        else try { combined = turf.union(combined, feature); } catch(e){ console.warn("Union failed", e); }
      });

      if (!combined) return;

      const layer = L.geoJSON(combined, {
        color,
        fillColor: color,
        weight: 2,
        fillOpacity: 0.3
      }).bindTooltip(
        `<strong>${nom}</strong><br>Plancher: ${item.plancher}<br>Plafond: ${item.plafond}`,
        { sticky: true }
      );

      if (!categoryGroups[category]) categoryGroups[category] = {};
      if (!categoryGroups[category][couche]) categoryGroups[category][couche] = [];
      categoryGroups[category][couche].push(layer);
    });

    const overlays = [];
    Object.entries(categoryGroups).forEach(([cat, coucheLayers]) => {
      const layersArray = Object.entries(coucheLayers).map(([couche, shapes]) => {
        const groupLayer = L.layerGroup(shapes);
        return { name: couche, layer: groupLayer };
      });
      overlays.push({ group: cat, layers: layersArray, collapsed: true });
    });

    const panelLayers = new L.Control.PanelLayers(null, overlays, { collapsibleGroups: true });
    map.addControl(panelLayers);
  })
  .catch(err => {
    removeLoadingOverlay();
    console.error("Error fetching data:", err);
    alert("Failed to load map data.");
  });

// ---- Leaflet Draw ----
const drawnItems = new L.FeatureGroup().addTo(map);
let drawControl;

function initDraw(type) {
  if (drawControl) drawControl.remove();
  if (!type) return;

  const options = { edit: { featureGroup: drawnItems }, draw: {} };
  options.draw[type] = type === 'circle' ? { shapeOptions: { color: 'red' } } : {};
  ['marker','polyline','polygon','circle'].forEach(t => { if(t!==type) options.draw[t]=false; });

  drawControl = new L.Control.Draw(options);
  map.addControl(drawControl);
}

// Handle draw type selection
drawTypeSelect.addEventListener('change', () => {
  drawnItems.clearLayers();
  clickCoords = [];
  updateClickedCoords();
  initDraw(drawTypeSelect.value);
});

// Capture drawn features
map.on(L.Draw.Event.CREATED, e => {
  const layer = e.layer;
  drawnItems.addLayer(layer);

  let coords = [];
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    const radius_nm = layer.getRadius() / 1852; // meters → nautical miles
    coords = [center.lng, center.lat, radius_nm];
  } else if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    coords = [latlng.lng, latlng.lat];
  } else if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
    coords = layer.getLatLngs()[0].map(ll => [ll.lng,ll.lat]);
  }
  clickCoords.push(coords);
  updateClickedCoords();
});

// ---- Geometry parser ----
function parseGeometry(obj) {
  if (!obj) return null;
  try {
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;
    if (parsed.center && parsed.radius)
      return turf.circle(parsed.center, parsed.radius, parsed.options || {});
    if (Array.isArray(parsed)) {
      if (parsed.length === 2 && typeof parsed[0]==="number") return turf.point(parsed);
      if (parsed.length>1 && Array.isArray(parsed[0])) {
        const first = parsed[0], last = parsed[parsed.length-1];
        if (first[0]===last[0] && first[1]===last[1]) return turf.polygon([parsed]);
        return turf.lineString(parsed);
      }
    }
  } catch(e){ console.warn("Invalid geometry:", obj,e);}
  return null;
}
