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

// ---- Clicked coordinates below the map ----
const clickedCoordsBox = document.getElementById("clickedCoordsBox");

function updateClickedCoords() {
  clickedCoordsBox.innerHTML = `<strong>Clicked:</strong> <pre>${JSON.stringify(clickCoords, null, 2)}</pre>`;
}

document.getElementById("clearBtn").addEventListener("click", () => {
  clickCoords = [];
  clickMarkers.clearLayers();
  updateClickedCoords();
});

document.getElementById("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(JSON.stringify(clickCoords, null, 2))
    .then(() => alert("Coordinates copied!"))
    .catch(err => console.error(err));
});

map.on("click", e => {
  clickCoords.push([e.latlng.lng, e.latlng.lat]);
  L.marker(e.latlng).addTo(clickMarkers);
  updateClickedCoords();
});

// ---- Example white overlay with adjustable opacity ----
const whiteOverlay = L.rectangle([[90, -180], [-90, 180]], {
  color: "#fff",
  weight: 0,
  fillOpacity: 1
}).addTo(map);

const opacitySlider = document.getElementById("opacitySlider");
const opacityValue = document.getElementById("opacityValue");

opacitySlider.addEventListener("input", e => {
  const value = parseFloat(e.target.value);
  whiteOverlay.setStyle({ fillOpacity: value });
  opacityValue.innerText = `${Math.round(value * 100)}%`;
});
