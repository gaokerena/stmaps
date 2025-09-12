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

    const categoryGroups = {}; // group by catégorie

    data.forEach(item => {
      const category = (item.categorie || "").trim();
      const couche = (item.couche || "Default").trim();
      const nom = (item.nom || "Shape").trim();
      if (!category) return;

      // ---- Waypoint special case ----
      if (category === "Waypoint") {
        const coords = parseGeometry(item.p1);
        if (!coords) return;

        const triangleIcon = L.divIcon({
          className: 'triangle-marker',
          html: `<div></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const marker = L.marker([coords.geometry.coordinates[1], coords.geometry.coordinates[0]], { icon: triangleIcon });

        const label = L.divIcon({
          className: 'waypoint-label',
          html: `<span>${nom}</span>`,
          iconAnchor: [-5, 15],
          interactive: false
        });

        const labelMarker = L.marker([coords.geometry.coordinates[1], coords.geometry.coordinates[0]], { icon: label });

        if (!categoryGroups[category]) categoryGroups[category] = {};
        if (!categoryGroups[category][couche]) categoryGroups[category][couche] = [];
        categoryGroups[category][couche].push(marker, labelMarker);

        return; // skip normal polygon logic
      }

      // ---- Polygon shapes ----
      const quads = [
        [item.p1, item.intp1, item.exp1],
        [item.p2, item.intp2, item.exp2],
        [item.p3, item.intp3, item.exp3],
        [item.p4,
