const scriptURL = "https://script.google.com/macros/s/AKfycbxHz5OBOFSrpRUZlKqL_5h-yk3jVJkW9wrKd2YXUm7Of-iRzY0zitxt_LGNj7jXifAW/exec";

function parseData(data) {
       // This function is called by your JSONP response
    const container = document.getElementById("data-container");
    container.innerHTML = ""; // Clear "Loading..."

    data.forEach(item => {
      // Create a new div for each item
      const card = document.createElement("div");
      card.className = "card"; // Optional CSS class

      // Add content
      card.innerHTML = `
        <strong>${item.nom}</strong><br/>
        Catégorie: ${item.categorie}<br/>
        Plancher: ${item.plancher}, Plafond: ${item.plafond}<br/>
        P1: ${item.p1}
      `;

      // Append the div to the container
      container.appendChild(card);
  });
}

