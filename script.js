// This function will be called by the JSONP response
function handleData(data) {
  console.log(data);
  const container = document.getElementById("data-container");
  container.innerHTML = ""; // Clear any previous content

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${item.nom}</strong> <br/>
      Catégorie: ${item.categorie} <br/>
      Plancher: ${item.plancher}, Plafond: ${item.plafond}
    `;
    container.appendChild(card);
  });
}

// Dynamically add a <script> tag to load the JSONP data
const script = document.createElement("script");
script.src = "https://script.google.com/macros/s/AKfycbxaYXlocGh2AfEbyi8KcPEeN4GNxRkXkUVwfxOZGuxQPBc48jatKK-ILhb_N4Kby8H9/exec?callback=handleData";
document.body.appendChild(script);
