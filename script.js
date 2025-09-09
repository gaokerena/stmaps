const apiUrl = "https://script.google.com/macros/s/AKfycbxaYXlocGh2AfEbyi8KcPEeN4GNxRkXkUVwfxOZGuxQPBc48jatKK-ILhb_N4Kby8H9/exec";

async function loadData() {
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    const container = document.getElementById("data-container");
    container.innerHTML = ""; // clear "Loading..."

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
  } catch (err) {
    console.error("Error loading data:", err);
    document.getElementById("data-container").textContent =
      "Failed to load data.";
  }
}

loadData();
