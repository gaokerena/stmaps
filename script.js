const scriptURL = "https://script.google.com/macros/s/AKfycbxHz5OBOFSrpRUZlKqL_5h-yk3jVJkW9wrKd2YXUm7Of-iRzY0zitxt_LGNj7jXifAW/exec";

fetch(scriptURL)
  .then(response => response.json())
  .then(data => {
    const container = document.getElementById("data-container");
    container.innerHTML = ""; // Clear "Loading..."

    data.forEach(item => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <strong>${item.nom}</strong><br/>
        Catégorie: ${item.categorie}<br/>
        Plancher: ${item.plancher}, Plafond: ${item.plafond}<br/>
        P1: ${item.p1}
      `;
      container.appendChild(card);
    });
  })
  .catch(err => console.error("Error fetching data:", err));


