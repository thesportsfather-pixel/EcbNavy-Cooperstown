const players = [
  { key: "knox-graham", name: "Knox Graham", number: 1 },
  { key: "ridge-crewss", name: "Ridge Crewss", number: 2 },
  { key: "sebastian-erhard", name: "Sebastian Erhard", number: 5 },
  { key: "miguel-garcia", name: "Miguel Garcia", number: 11 },
  { key: "alfonso-santiago", name: "Alfonso Santiago", number: 12 },
  { key: "cole-edgos", name: "Cole Edgos", number: 17 },
  { key: "ripken-knapp", name: "Ripken Knapp", number: 19 },
  { key: "isaac-cepeda", name: "Isaac Cepeda", number: 22 },
  { key: "journey-petersen", name: "Journey Petersen", number: 23 },
  { key: "jordan-santos", name: "Jordan Santos", number: 24 },
  { key: "josiah-colon", name: "Josiah Colon", number: 27 },
  { key: "mathias-bernal", name: "Mathias Bernal", number: 50 },
  { key: "christian-alicea", name: "Christian Alicea", number: 99 }
];

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const playerSelect = document.getElementById("playerSelect");
const fundraiserSection = document.getElementById("fundraiserSection");
const selectedPlayerName = document.getElementById("selectedPlayerName");
const baseballGrid = document.getElementById("baseballGrid");

const selectedCount = document.getElementById("selectedCount");
const donationTotal = document.getElementById("donationTotal");
const checkoutButton = document.getElementById("checkoutButton");

const donorName = document.getElementById("donorName");
const anonymousDonation = document.getElementById("anonymousDonation");

const generalDonationAmount = document.getElementById("generalDonationAmount");
const generalDonationPlayer = document.getElementById("generalDonationPlayer");
const generalDonorName = document.getElementById("generalDonorName");
const generalAnonymousDonation = document.getElementById("generalAnonymousDonation");
const generalDonationButton = document.getElementById("generalDonationButton");

let currentPlayer = null;
let selectedBaseballs = new Set();
let soldBaseballs = new Set();

function getPlayerByKey(key) {
  return players.find(player => player.key === key) || null;
}

async function loadSoldBaseballs(playerKey) {
  soldBaseballs.clear();

  const { data, error } = await supabaseClient
    .from("fundraiser_balls")
    .select("ball_number,status")
    .eq("player_key", playerKey);

  if (error) {
    console.error("Error loading sold baseballs:", error);

    alert(
      "There was a problem loading this player's fundraiser board. Please refresh and try again."
    );

    return false;
  }

  data.forEach(row => {
    if (row.status === "sold") {
      soldBaseballs.add(row.ball_number);
    }
  });

  return true;
}

function renderBoard() {
  baseballGrid.innerHTML = "";

  for (let number = 1; number <= 100; number++) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "baseball";
    button.dataset.number = number;

    const numberSpan = document.createElement("span");
    numberSpan.textContent = number;

    button.appendChild(numberSpan);

    if (soldBaseballs.has(number)) {
      button.classList.add("sold");
      button.disabled = true;
      button.setAttribute("aria-label", `Baseball ${number} sold`);
    } else {
      button.setAttribute("aria-label", `Select baseball ${number}`);

      button.addEventListener("click", () => {
        toggleBaseball(number, button);
      });
    }

    baseballGrid.appendChild(button);
  }

  updateCheckoutSummary();
}

function toggleBaseball(number, button) {
  if (selectedBaseballs.has(number)) {
    selectedBaseballs.delete(number);
    button.classList.remove("selected");
  } else {
    selectedBaseballs.add(number);
    button.classList.add("selected");
  }

  updateCheckoutSummary();
}

function calculateSelectedTotal() {
  return [...selectedBaseballs].reduce(
    (sum, number) => sum + number,
    0
  );
}

function updateCheckoutSummary() {
  const count = selectedBaseballs.size;
  const total = calculateSelectedTotal();

  selectedCount.textContent = count;
  donationTotal.textContent = `$${total}`;

  checkoutButton.disabled = count === 0 || !currentPlayer;
}

playerSelect.addEventListener("change", async () => {
  const playerKey = playerSelect.value;

  if (!playerKey) {
    currentPlayer = null;
    fundraiserSection.classList.add("hidden");
    selectedBaseballs.clear();
    soldBaseballs.clear();
    updateCheckoutSummary();
    return;
  }

  currentPlayer = getPlayerByKey(playerKey);

  if (!currentPlayer) {
    return;
  }

  selectedPlayerName.textContent =
    `#${currentPlayer.number} ${currentPlayer.name}`;

  fundraiserSection.classList.remove("hidden");

  selectedBaseballs.clear();

  baseballGrid.innerHTML = `
    <div style="
      grid-column: 1 / -1;
      text-align: center;
      padding: 30px;
      font-weight: 700;
    ">
      Loading fundraiser board...
    </div>
  `;

  checkoutButton.disabled = true;

  const loaded = await loadSoldBaseballs(currentPlayer.key);

  if (!loaded) {
    baseballGrid.innerHTML = `
      <div style="
        grid-column: 1 / -1;
        text-align: center;
        padding: 30px;
      ">
        Unable to load fundraiser board.
      </div>
    `;
    return;
  }

  renderBoard();

  fundraiserSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

anonymousDonation.addEventListener("change", () => {
  if (anonymousDonation.checked) {
    donorName.value = "";
    donorName.disabled = true;
    donorName.placeholder = "Anonymous";
  } else {
    donorName.disabled = false;
    donorName.placeholder = "Enter your name";
  }
});

generalAnonymousDonation.addEventListener("change", () => {
  if (generalAnonymousDonation.checked) {
    generalDonorName.value = "";
    generalDonorName.disabled = true;
    generalDonorName.placeholder = "Anonymous";
  } else {
    generalDonorName.disabled = false;
    generalDonorName.placeholder = "Enter your name";
  }
});

function updateGeneralDonationButton() {
  const amount = Number(generalDonationAmount.value);

  generalDonationButton.disabled =
    !Number.isFinite(amount) || amount < 1;
}

generalDonationAmount.addEventListener(
  "input",
  updateGeneralDonationButton
);

checkoutButton.addEventListener("click", async () => {
  if (!currentPlayer || selectedBaseballs.size === 0) {
    return;
  }

  const baseballNumbers = [...selectedBaseballs].sort(
    (a, b) => a - b
  );

  const total = calculateSelectedTotal();

  const finalDonorName = anonymousDonation.checked
    ? "Anonymous"
    : donorName.value.trim() || "Anonymous";

  const checkoutData = {
    type: "baseballs",
    playerKey: currentPlayer.key,
    playerName: currentPlayer.name,
    playerNumber: currentPlayer.number,
    baseballNumbers,
    amount: total,
    donorName: finalDonorName,
    anonymous: anonymousDonation.checked
  };

  console.log("Baseball checkout:", checkoutData);

  alert(
    `Checkout ready:\n\n` +
    `Player: #${currentPlayer.number} ${currentPlayer.name}\n` +
    `Baseballs: ${baseballNumbers.join(", ")}\n` +
    `Total: $${total}\n` +
    `Donor: ${finalDonorName}`
  );
});

generalDonationButton.addEventListener("click", async () => {
  const amount = Number(generalDonationAmount.value);

  if (!Number.isFinite(amount) || amount < 1) {
    return;
  }

  const selectedPlayerKey = generalDonationPlayer.value;

  let selectedPlayer = null;

  if (selectedPlayerKey !== "team") {
    selectedPlayer = getPlayerByKey(selectedPlayerKey);
  }

  const finalDonorName = generalAnonymousDonation.checked
    ? "Anonymous"
    : generalDonorName.value.trim() || "Anonymous";

  const donationData = {
    type: "general",
    playerKey: selectedPlayer ? selectedPlayer.key : "team",
    playerName: selectedPlayer
      ? selectedPlayer.name
      : "ECB Navy Team",
    playerNumber: selectedPlayer ? selectedPlayer.number : null,
    amount,
    donorName: finalDonorName,
    anonymous: generalAnonymousDonation.checked
  };

  console.log("General donation:", donationData);

  alert(
    `General donation ready:\n\n` +
    `Supporting: ${
      selectedPlayer
        ? `#${selectedPlayer.number} ${selectedPlayer.name}`
        : "ECB Navy Team"
    }\n` +
    `Amount: $${amount}\n` +
    `Donor: ${finalDonorName}`
  );
});

updateGeneralDonationButton();
