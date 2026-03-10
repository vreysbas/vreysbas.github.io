const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "Kleerkast0428!";
const PRODUCTS = [
  { id: 1, name: "Classic Hoodie", price: 59.99 },
  { id: 2, name: "Sport Sneakers", price: 89.5 },
  { id: 3, name: "Travel Backpack", price: 74.0 },
  { id: 4, name: "Daily Water Bottle", price: 24.99 },
  { id: 5, name: "Basic Fortnite Account", price: 10.0 }
];

const PAGE = document.body.dataset.page;
const MAIL_CONFIG = window.MAIL_CONFIG || {
  enabled: false,
  provider: "web3forms",
  accessKey: "",
  ownerEmail: "",
  fromName: "Conga Shop",
  fromEmail: "no-reply@congaxd.me",
  replyTo: ""
};

const state = {
  cart: JSON.parse(localStorage.getItem("cart")) || [],
  orders: JSON.parse(localStorage.getItem("orders")) || [],
  accounts: JSON.parse(localStorage.getItem("accounts")) || [],
  currentUser: JSON.parse(sessionStorage.getItem("currentUser") || "null")
};

function ensureDefaultAdminAccount() {
  const adminIndex = state.accounts.findIndex((a) => a.username === ADMIN_USER && a.isAdmin);
  if (adminIndex === -1) {
    state.accounts.push({
      username: ADMIN_USER,
      email: "admin@congashop.local",
      password: ADMIN_PASS,
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
  } else {
    // Keep admin account password in sync with the configured owner password.
    state.accounts[adminIndex].password = ADMIN_PASS;
  }
}

function saveState() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  localStorage.setItem("orders", JSON.stringify(state.orders));
  localStorage.setItem("accounts", JSON.stringify(state.accounts));
  if (state.currentUser) {
    sessionStorage.setItem("currentUser", JSON.stringify(state.currentUser));
  } else {
    sessionStorage.removeItem("currentUser");
  }
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function notificationsEnabled() {
  return Boolean(MAIL_CONFIG.enabled && MAIL_CONFIG.provider === "web3forms" && MAIL_CONFIG.accessKey);
}

async function sendNotificationEmail({ toEmail, toName, subject, message }) {
  try {
    if (!notificationsEnabled()) return;

    const payload = {
      access_key: MAIL_CONFIG.accessKey,
      subject,
      from_name: MAIL_CONFIG.fromName || "Conga Shop",
      to_email: toEmail,
      name: toName,
      email: MAIL_CONFIG.fromEmail || "no-reply@congaxd.me",
      message,
      replyto: MAIL_CONFIG.replyTo || MAIL_CONFIG.ownerEmail || MAIL_CONFIG.fromEmail || ""
    };

    if (MAIL_CONFIG.ownerEmail) {
      payload.ccemail = MAIL_CONFIG.ownerEmail;
    }

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error("Web3Forms request failed", response.status);
    }
  } catch (error) {
    console.error("Email send failed:", error);
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidAddress(address) {
  const compact = address.trim();
  const hasNumber = /\d/.test(compact);
  const hasLetters = /[a-zA-Z]/.test(compact);
  return compact.length >= 8 && hasNumber && hasLetters;
}

function isValidFullName(name) {
  return /^[a-zA-Z\s.'-]{2,}$/.test(name.trim());
}

function renderShop() {
  const productGrid = document.getElementById("productGrid");
  const cartCount = document.getElementById("cartCount");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");
  const adminTabLink = document.getElementById("adminTabLink");
  const userWelcome = document.getElementById("userWelcome");
  const openAuthBtn = document.getElementById("openAuthBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const authError = document.getElementById("authError");

  function updateAuthUi() {
    const loggedIn = Boolean(state.currentUser);
    const isAdmin = Boolean(state.currentUser?.isAdmin);
    adminTabLink.classList.toggle("hidden", !isAdmin);
    openAuthBtn.classList.toggle("hidden", loggedIn);
    logoutBtn.classList.toggle("hidden", !loggedIn);
    userWelcome.textContent = loggedIn
      ? `Ingelogd als ${state.currentUser.username}${isAdmin ? " (admin)" : ""}`
      : "Niet ingelogd";
  }

  function renderProducts() {
    productGrid.innerHTML = PRODUCTS.map((p) => `
      <article class="product-card">
        <h3>${p.name}</h3>
        <p class="price">EUR ${formatMoney(p.price)}</p>
        <button class="primary-btn" data-add="${p.id}">Add to cart</button>
      </article>
    `).join("");
  }

  function renderCart() {
    cartCount.textContent = state.cart.reduce((n, item) => n + item.qty, 0);
    cartTotalEl.textContent = formatMoney(cartTotal());

    if (state.cart.length === 0) {
      cartItems.innerHTML = "<p>Je winkelmand is leeg.</p>";
      return;
    }

    cartItems.innerHTML = state.cart.map((item) => `
      <div class="cart-item">
        <div>
          <strong>${item.name}</strong><br>
          EUR ${formatMoney(item.price)} x ${item.qty}
        </div>
        <button class="ghost-btn" data-remove="${item.id}">Verwijder</button>
      </div>
    `).join("");
  }

  function addToCart(productId) {
    const product = PRODUCTS.find((x) => x.id === Number(productId));
    if (!product) return;
    const existing = state.cart.find((x) => x.id === product.id);
    if (existing) existing.qty += 1;
    else state.cart.push({ ...product, qty: 1 });
    saveState();
    renderCart();
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter((x) => x.id !== Number(productId));
    saveState();
    renderCart();
  }

  function toggle(id, show) {
    const node = document.getElementById(id);
    node.classList.toggle("hidden", !show);
  }

  function placeOrder(formData) {
    if (state.cart.length === 0) {
      alert("Je winkelmand is leeg.");
      return;
    }

    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const address = String(formData.get("address") || "").trim();

    if (!isValidFullName(fullName)) {
      alert("Vul een geldige naam in.");
      return;
    }

    if (!isValidEmail(email)) {
      alert("Vul een geldig e-mailadres in.");
      return;
    }

    if (!isValidAddress(address)) {
      alert("Vul een geldig adres in (straat + nummer, min. 8 tekens).");
      return;
    }

    const method = formData.get("paymentMethod");
    const reference = (formData.get("paymentReference") || "").trim();
    const total = cartTotal();

    const isMarkedPaid = method !== "cash" && reference.length > 0;
    const paymentStatus = isMarkedPaid ? "paid" : "pending";
    const paidAmount = isMarkedPaid ? total : 0;

    const order = {
      id: crypto.randomUUID(),
      username: state.currentUser?.username || "guest",
      fullName,
      email,
      address,
      items: [...state.cart],
      total,
      orderStatus: "new",
      paymentMethod: method,
      paymentStatus,
      paidAmount,
      paymentReference: reference,
      createdAt: new Date().toISOString()
    };

    state.orders.unshift(order);
    state.cart = [];
    saveState();
    renderCart();
    toggle("checkoutModal", false);

    sendNotificationEmail({
      toEmail: order.email,
      toName: order.fullName,
      subject: `Conga Shop - Bevestiging bestelling ${order.id}`,
      message: `Beste ${order.fullName},\n\nHartelijk dank voor je bestelling bij Conga Shop.\n\nBestelgegevens\n- Bestelnummer: ${order.id}\n- Datum: ${new Date(order.createdAt).toLocaleString()}\n- Totaalbedrag: EUR ${formatMoney(order.total)}\n- Betaalmethode: ${order.paymentMethod}\n- Betaalstatus: ${order.paymentStatus}\n- Orderstatus: ${order.orderStatus}\n\nLeveradres\n${order.address}\n\nWe houden je op de hoogte wanneer de status van je bestelling verandert.\n\nMet vriendelijke groeten,\nConga Shop\nSupport: support@congaxd.me`
    });

    alert("Bestelling geplaatst!");
  }

  document.addEventListener("click", (e) => {
    const add = e.target.getAttribute("data-add");
    const remove = e.target.getAttribute("data-remove");
    if (add) addToCart(add);
    if (remove) removeFromCart(remove);
  });

  document.getElementById("openCartBtn").addEventListener("click", () => toggle("cartPanel", true));
  document.getElementById("closeCartBtn").addEventListener("click", () => toggle("cartPanel", false));
  document.getElementById("checkoutBtn").addEventListener("click", () => toggle("checkoutModal", true));
  document.getElementById("closeCheckoutBtn").addEventListener("click", () => toggle("checkoutModal", false));
  document.getElementById("openAuthBtn").addEventListener("click", () => {
    authError.textContent = "";
    toggle("authModal", true);
  });
  document.getElementById("closeAuthBtn").addEventListener("click", () => toggle("authModal", false));

  document.getElementById("showLoginTabBtn").addEventListener("click", () => {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("registerForm").classList.add("hidden");
    authError.textContent = "";
  });

  document.getElementById("showRegisterTabBtn").addEventListener("click", () => {
    document.getElementById("registerForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
    authError.textContent = "";
  });

  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const username = String(data.get("username") || "").trim();
    const password = String(data.get("password") || "");

    const account = state.accounts.find((a) => a.username === username && a.password === password);
    if (!account) {
      authError.textContent = "Login mislukt.";
      return;
    }

    state.currentUser = {
      username: account.username,
      email: account.email,
      isAdmin: account.isAdmin
    };
    saveState();
    e.target.reset();
    toggle("authModal", false);
    updateAuthUi();
  });

  document.getElementById("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const username = String(data.get("username") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    if (!username || !email || !password) {
      authError.textContent = "Vul alle velden in.";
      return;
    }

    if (state.accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      authError.textContent = "Username bestaat al.";
      return;
    }

    const newAccount = {
      username,
      email,
      password,
      isAdmin: false,
      createdAt: new Date().toISOString()
    };

    state.accounts.push(newAccount);
    state.currentUser = { username, email, isAdmin: false };
    saveState();
    e.target.reset();
    toggle("authModal", false);
    updateAuthUi();

    sendNotificationEmail({
      toEmail: newAccount.email,
      toName: newAccount.username,
      subject: "Conga Shop - Account succesvol aangemaakt",
      message: `Beste ${newAccount.username},\n\nJe account is succesvol aangemaakt bij Conga Shop.\n\nAccountgegevens\n- Gebruikersnaam: ${newAccount.username}\n- E-mail: ${newAccount.email}\n- Aangemaakt op: ${new Date(newAccount.createdAt).toLocaleString()}\n\nJe kan nu bestellingen plaatsen en je gegevens beheren.\n\nMet vriendelijke groeten,\nConga Shop\nSupport: support@congaxd.me`
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    state.currentUser = null;
    saveState();
    updateAuthUi();
  });

  document.getElementById("checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    placeOrder(new FormData(e.target));
    e.target.reset();
  });

  renderProducts();
  renderCart();
  updateAuthUi();
}

function renderAdminPage() {
  const adminAccessDenied = document.getElementById("adminAccessDenied");
  const adminPanel = document.getElementById("adminPanel");

  const kpiOrders = document.getElementById("kpiOrders");
  const kpiRevenue = document.getElementById("kpiRevenue");
  const kpiPaid = document.getElementById("kpiPaid");
  const kpiCustomers = document.getElementById("kpiCustomers");
  const orderTableBody = document.getElementById("orderTableBody");
  const accountsTableBody = document.getElementById("accountsTableBody");

  function showAdminAccess(show) {
    adminAccessDenied.classList.toggle("hidden", show);
    adminPanel.classList.toggle("hidden", !show);
  }

  function renderAdminData() {
    const totalOrders = state.orders.length;
    const totalRevenue = state.orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalPaid = state.orders.reduce((s, o) => s + Number(o.paidAmount || 0), 0);
    const uniqueCustomers = new Set(state.orders.map((o) => o.email)).size;

    kpiOrders.textContent = totalOrders;
    kpiRevenue.textContent = formatMoney(totalRevenue);
    kpiPaid.textContent = formatMoney(totalPaid);
    kpiCustomers.textContent = uniqueCustomers;

    if (state.orders.length === 0) {
      orderTableBody.innerHTML = "<tr><td colspan='13'>Nog geen bestellingen.</td></tr>";
    } else {
      orderTableBody.innerHTML = state.orders.map((o, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${o.fullName}</td>
          <td>${o.email}</td>
          <td>${o.address}</td>
          <td>${o.items.map((i) => `${i.name} (${i.qty})`).join(", ")}</td>
          <td>EUR ${formatMoney(o.total)}</td>
          <td>EUR ${formatMoney(o.paidAmount || 0)}</td>
          <td><span class="status-badge ${o.orderStatus === "cancelled" ? "cancelled" : "pending"}">${o.orderStatus || "new"}</span></td>
          <td><span class="status-badge ${o.paymentStatus === "paid" ? "paid" : "pending"}">${o.paymentStatus}</span></td>
          <td>${o.paymentMethod || "-"}</td>
          <td>${o.paymentReference || "-"}</td>
          <td>${new Date(o.createdAt).toLocaleString()}</td>
          <td>
            <div class="admin-actions">
              <select data-order-status="${o.id}">
                <option value="new" ${o.orderStatus === "new" ? "selected" : ""}>new</option>
                <option value="processing" ${o.orderStatus === "processing" ? "selected" : ""}>processing</option>
                <option value="shipped" ${o.orderStatus === "shipped" ? "selected" : ""}>shipped</option>
                <option value="completed" ${o.orderStatus === "completed" ? "selected" : ""}>completed</option>
                <option value="cancelled" ${o.orderStatus === "cancelled" ? "selected" : ""}>cancelled</option>
              </select>
              <button class="ghost-btn" data-save-order="${o.id}">Opslaan</button>
              <button class="ghost-btn danger-btn" data-cancel-order="${o.id}">Cancel</button>
            </div>
          </td>
        </tr>
      `).join("");
    }

    if (state.accounts.length === 0) {
      accountsTableBody.innerHTML = "<tr><td colspan='5'>Nog geen accounts.</td></tr>";
      return;
    }

    accountsTableBody.innerHTML = state.accounts.map((a, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${a.username}</td>
        <td>${a.email || "-"}</td>
        <td>${a.isAdmin ? "admin" : "user"}</td>
        <td>${new Date(a.createdAt).toLocaleString()}</td>
      </tr>
    `).join("");
  }

  function exportOrdersCsv() {
    const headers = [
      "OrderNr", "Klant", "Email", "Adres", "Items", "TotaalEUR",
      "BetaaldEUR", "OrderStatus", "PaymentStatus", "Methode", "Referentie", "Tijdstip"
    ];

    const rows = state.orders.map((o, idx) => [
      idx + 1,
      o.fullName,
      o.email,
      o.address,
      o.items.map((i) => `${i.name} (${i.qty})`).join(", "),
      formatMoney(o.total),
      formatMoney(o.paidAmount || 0),
      o.orderStatus || "new",
      o.paymentStatus,
      o.paymentMethod,
      o.paymentReference || "",
      new Date(o.createdAt).toLocaleString()
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map(escapeCsvValue).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAccountsCsv() {
    const headers = ["Nr", "Username", "Email", "Role", "CreatedAt"];
    const rows = state.accounts.map((a, idx) => [
      idx + 1,
      a.username,
      a.email || "",
      a.isAdmin ? "admin" : "user",
      new Date(a.createdAt).toLocaleString()
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map(escapeCsvValue).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("logoutAdminBtn").addEventListener("click", () => {
    state.currentUser = null;
    saveState();
    window.location.href = "index.html";
  });

  document.getElementById("exportOrdersBtn").addEventListener("click", exportOrdersCsv);
  document.getElementById("exportAccountsBtn").addEventListener("click", exportAccountsCsv);

  orderTableBody.addEventListener("click", (e) => {
    const saveOrderId = e.target.getAttribute("data-save-order");
    const cancelOrderId = e.target.getAttribute("data-cancel-order");

    if (saveOrderId) {
      const selectEl = document.querySelector(`select[data-order-status="${saveOrderId}"]`);
      if (!selectEl) return;
      const order = state.orders.find((o) => o.id === saveOrderId);
      if (!order) return;
      const previousStatus = order.orderStatus || "new";
      order.orderStatus = selectEl.value;
      saveState();
      renderAdminData();

      if (order.orderStatus !== previousStatus && isValidEmail(order.email)) {
        sendNotificationEmail({
          toEmail: order.email,
          toName: order.fullName,
          subject: `Conga Shop - Statusupdate bestelling ${order.id}`,
          message: `Beste ${order.fullName},\n\nEr is een update voor je bestelling bij Conga Shop.\n\nUpdate\n- Bestelnummer: ${order.id}\n- Nieuwe orderstatus: ${order.orderStatus}\n- Betaalstatus: ${order.paymentStatus}\n\nJe ontvangt automatisch een nieuwe melding wanneer er opnieuw een wijziging is.\n\nMet vriendelijke groeten,\nConga Shop\nSupport: support@congaxd.me`
        });
      }
      return;
    }

    if (cancelOrderId) {
      const order = state.orders.find((o) => o.id === cancelOrderId);
      if (!order) return;
      order.orderStatus = "cancelled";
      saveState();
      renderAdminData();

      if (isValidEmail(order.email)) {
        sendNotificationEmail({
          toEmail: order.email,
          toName: order.fullName,
          subject: `Conga Shop - Bestelling ${order.id} geannuleerd`,
          message: `Beste ${order.fullName},\n\nJe bestelling werd geannuleerd in ons systeem.\n\nAnnulatiegegevens\n- Bestelnummer: ${order.id}\n- Datum annulatie: ${new Date().toLocaleString()}\n- Laatste gekende betaalstatus: ${order.paymentStatus}\n\nAls dit onverwacht is, neem dan contact op met support@congaxd.me en vermeld je bestelnummer.\n\nMet vriendelijke groeten,\nConga Shop`
        });
      }
    }
  });

  if (state.currentUser?.isAdmin) {
    renderAdminData();
    showAdminAccess(true);
  } else {
    showAdminAccess(false);
  }
}

ensureDefaultAdminAccount();
saveState();

if (PAGE === "shop") {
  renderShop();
}

if (PAGE === "admin") {
  renderAdminPage();
}
