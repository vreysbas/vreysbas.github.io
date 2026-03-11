const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "Kleerkast0428!";
const DEFAULT_PRODUCTS = [
  { id: 1, name: "EAFC 26 Meta Guide", price: 14.99 },
  { id: 2, name: "Weekend League Coaching (30m)", price: 24.99 },
  { id: 3, name: "Custom Tactics Pack", price: 9.99 },
  { id: 4, name: "Squad Builder Review", price: 12.5 }
];

const PAGE = document.body.dataset.page;
const PAYPAL_TRANSFER_EMAIL = "congaxd@gmail.com";
const MAIL_CONFIG = window.MAIL_CONFIG || {
  enabled: false,
  provider: "web3forms",
  accessKey: "",
  ownerEmail: "",
  fromName: "EAFC 26 Hub",
  fromEmail: "no-reply@example.com",
  replyTo: ""
};

const state = {
  cart: JSON.parse(localStorage.getItem("cart")) || [],
  orders: JSON.parse(localStorage.getItem("orders")) || [],
  accounts: JSON.parse(localStorage.getItem("accounts")) || [],
  products: JSON.parse(localStorage.getItem("products")) || DEFAULT_PRODUCTS,
  currentUser: JSON.parse(sessionStorage.getItem("currentUser") || "null")
};

function getStoredCustomerOrderIds() {
  return JSON.parse(localStorage.getItem("customerOrderIds") || "[]");
}

function storeCustomerOrderId(orderId) {
  const ids = getStoredCustomerOrderIds();
  if (!ids.includes(orderId)) {
    ids.unshift(orderId);
    localStorage.setItem("customerOrderIds", JSON.stringify(ids.slice(0, 50)));
  }
}

function ensureTestProduct() {
  const testProductName = "Test betaling 0.01 EUR";
  const existing = state.products.find((p) => p.name === testProductName);
  if (existing) {
    existing.price = 0.01;
    return;
  }

  state.products.unshift({
    id: Date.now(),
    name: testProductName,
    price: 0.01
  });
}

function ensureDefaultAdminAccount() {
  const adminIndex = state.accounts.findIndex((a) => a.username === ADMIN_USER && a.isAdmin);
  if (adminIndex === -1) {
    state.accounts.push({
      username: ADMIN_USER,
      email: "admin@eafc26hub.local",
      password: ADMIN_PASS,
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
  } else {
    state.accounts[adminIndex].password = ADMIN_PASS;
  }
}

function saveState() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  localStorage.setItem("orders", JSON.stringify(state.orders));
  localStorage.setItem("accounts", JSON.stringify(state.accounts));
  localStorage.setItem("products", JSON.stringify(state.products));
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
      from_name: MAIL_CONFIG.fromName || "EAFC 26 Hub",
      to_email: toEmail,
      name: toName,
      email: MAIL_CONFIG.fromEmail || "no-reply@example.com",
      message,
      replyto: MAIL_CONFIG.replyTo || MAIL_CONFIG.ownerEmail || MAIL_CONFIG.fromEmail || ""
    };

    if (MAIL_CONFIG.ownerEmail) {
      payload.ccemail = MAIL_CONFIG.ownerEmail;
    }

    await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Email send failed:", error);
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidFullName(name) {
  return /^[a-zA-Z\s.'-]{2,}$/.test(name.trim());
}

function isValidEafcTag(tag) {
  return tag.trim().length >= 2;
}

function generateReadableOrderId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `EA26-${y}${m}${d}-${h}${min}-${suffix}`;
}

function renderShop() {
  const productGrid = document.getElementById("productGrid");
  const cartCount = document.getElementById("cartCount");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");
  const customerOrdersList = document.getElementById("customerOrdersList");
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
    productGrid.innerHTML = state.products.map((p) => `
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

  function renderCustomerOrders() {
    const storedOrderIds = getStoredCustomerOrderIds();
    const orders = state.orders.filter((order) => {
      if (state.currentUser?.email) {
        return order.email === state.currentUser.email;
      }
      return storedOrderIds.includes(order.id);
    });

    if (orders.length === 0) {
      customerOrdersList.innerHTML = "<p>Je hebt nog geen orders.</p>";
      return;
    }

    customerOrdersList.innerHTML = orders.map((order) => `
      <article class="order-card">
        <div class="panel-head">
          <strong>${order.id}</strong>
          <span class="status-badge ${order.paymentStatus === "paid" ? "paid" : "pending"}">${order.paymentStatus}</span>
        </div>
        <div class="order-meta">
          <span><strong>Orderstatus:</strong> ${order.orderStatus}</span>
          <span><strong>Totaal:</strong> EUR ${formatMoney(order.total)}</span>
          <span><strong>EAFC ID:</strong> ${order.eafcTag || "-"}</span>
          <span><strong>Items:</strong> ${order.items.map((item) => `${item.name} (${item.qty})`).join(", ")}</span>
          <span><strong>Uitleg:</strong> ${order.paymentStatus === "paid" ? "Betaling ontvangen, check de orderstatus voor de voortgang." : "Betaal handmatig naar congaxd@gmail.com met dit order-ID in de beschrijving."}</span>
        </div>
      </article>
    `).join("");
  }

  function addToCart(productId) {
    const product = state.products.find((x) => x.id === Number(productId));
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

  function collectCheckoutData(formData) {
    if (state.cart.length === 0) {
      alert("Je winkelmand is leeg.");
      return null;
    }

    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const eafcTag = String(formData.get("eafcTag") || "").trim();
    const noRefundAck = formData.get("noRefundAck") === "on";

    if (!isValidFullName(fullName)) {
      alert("Vul een geldige naam in.");
      return null;
    }

    if (!isValidEmail(email)) {
      alert("Vul een geldig e-mailadres in.");
      return null;
    }

    if (!isValidEafcTag(eafcTag)) {
      alert("Vul een geldige EAFC gebruikersnaam in.");
      return null;
    }

    if (!noRefundAck) {
      alert("Je moet bevestigen dat foutieve betalingen niet terugbetaald worden.");
      return null;
    }

    return { fullName, email, eafcTag };
  }

  function placeOrder(formData) {
    const checkoutData = collectCheckoutData(formData);
    if (!checkoutData) return;

    const checkoutStatus = document.getElementById("checkoutStatus");
    const instructions = document.getElementById("manualPaymentInstructions");
    const summary = document.getElementById("manualPaymentSummary");
    const total = cartTotal();
    const orderId = generateReadableOrderId();

    const order = {
      id: orderId,
      username: state.currentUser?.username || "guest",
      fullName: checkoutData.fullName,
      email: checkoutData.email,
      eafcTag: checkoutData.eafcTag,
      items: [...state.cart],
      total,
      orderStatus: "awaiting_payment",
      paymentMethod: "paypal-manual-transfer",
      paymentStatus: "pending",
      paidAmount: 0,
      paymentReference: `Gebruik order-ID ${orderId} in PayPal beschrijving`,
      createdAt: new Date().toISOString()
    };

    state.orders.unshift(order);
    storeCustomerOrderId(order.id);
    state.cart = [];
    saveState();
    renderCart();
    renderCustomerOrders();
    instructions.classList.remove("hidden");
    checkoutStatus.textContent = "Order aangemaakt. Betaal nu exact volgens onderstaande stappen.";
    summary.innerHTML = `
      <strong>Te betalen:</strong> EUR ${formatMoney(order.total)}<br>
      <strong>PayPal account:</strong> ${PAYPAL_TRANSFER_EMAIL}<br>
      <strong>Order-ID voor beschrijving:</strong> ${order.id}<br>
      <strong>Belangrijk:</strong> Zonder dit order-ID in de beschrijving kunnen we je betaling niet koppelen.<br>
      <strong>Refund policy:</strong> Bij foutieve betaling is er geen refund mogelijk.
    `;

    sendNotificationEmail({
      toEmail: order.email,
      toName: order.fullName,
      subject: `EAFC 26 Hub - Bevestiging bestelling ${order.id}`,
      message: `Beste ${order.fullName},\n\nBedankt voor je bestelling bij EAFC 26 Hub.\n\nBestelgegevens\n- Bestelnummer: ${order.id}\n- Datum: ${new Date(order.createdAt).toLocaleString()}\n- Totaalbedrag: EUR ${formatMoney(order.total)}\n- EAFC gebruikersnaam: ${order.eafcTag}\n- Betaalmethode: Manuele PayPal overschrijving\n\nBetaal nu naar: ${PAYPAL_TRANSFER_EMAIL}\nVermeld verplicht dit order-ID in de beschrijving: ${order.id}\n\nRefund policy: Bij foutieve betaling (verkeerd bedrag, verkeerde ontvanger of ontbrekend order-ID) is er geen refund mogelijk.\n\nNa controle zetten we je order op betaald.\n\nMet vriendelijke groeten,\nEAFC 26 Hub`
    });

    alert("Order aangemaakt. Volg nu de betaalinstructies in het checkoutvenster.");
  }

  document.addEventListener("click", (e) => {
    const add = e.target.getAttribute("data-add");
    const remove = e.target.getAttribute("data-remove");
    if (add) addToCart(add);
    if (remove) removeFromCart(remove);
  });

  document.getElementById("openCartBtn").addEventListener("click", () => toggle("cartPanel", true));
  document.getElementById("closeCartBtn").addEventListener("click", () => toggle("cartPanel", false));
  document.getElementById("openOrdersBtn").addEventListener("click", () => {
    renderCustomerOrders();
    toggle("ordersPanel", true);
  });
  document.getElementById("closeOrdersBtn").addEventListener("click", () => toggle("ordersPanel", false));
  document.getElementById("checkoutBtn").addEventListener("click", () => {
    toggle("checkoutModal", true);
    document.getElementById("checkoutStatus").textContent = "Maak eerst je order aan. Daarna zie je exact waar je moet betalen.";
    document.getElementById("manualPaymentInstructions").classList.add("hidden");
    document.getElementById("manualPaymentSummary").textContent = "";
  });
  document.getElementById("closeCheckoutBtn").addEventListener("click", () => {
    toggle("checkoutModal", false);
    document.getElementById("checkoutForm").reset();
    document.getElementById("checkoutStatus").textContent = "";
    document.getElementById("manualPaymentInstructions").classList.add("hidden");
    document.getElementById("manualPaymentSummary").textContent = "";
  });
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
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    state.currentUser = null;
    saveState();
    updateAuthUi();
    renderCustomerOrders();
  });

  document.getElementById("checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    placeOrder(new FormData(e.target));
  });

  renderProducts();
  renderCart();
  renderCustomerOrders();
  updateAuthUi();
}

function renderAdminPage() {
  const adminAccessDenied = document.getElementById("adminAccessDenied");
  const adminPanel = document.getElementById("adminPanel");

  const kpiOrders = document.getElementById("kpiOrders");
  const kpiRevenue = document.getElementById("kpiRevenue");
  const kpiPaid = document.getElementById("kpiPaid");
  const kpiCustomers = document.getElementById("kpiCustomers");
  const kpiPendingPayments = document.getElementById("kpiPendingPayments");
  const orderTableBody = document.getElementById("orderTableBody");
  const accountsTableBody = document.getElementById("accountsTableBody");
  const productsTableBody = document.getElementById("productsTableBody");
  const orderSearchInput = document.getElementById("orderSearchInput");
  const paymentStatusFilter = document.getElementById("paymentStatusFilter");

  function getFilteredOrders() {
    const query = (orderSearchInput.value || "").trim().toLowerCase();
    const paymentFilter = paymentStatusFilter.value;

    return state.orders.filter((o) => {
      const textMatch = !query || [
        o.id,
        o.fullName,
        o.email,
        o.eafcTag,
        o.paymentReference
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(query));

      const paymentMatch = paymentFilter === "all" || o.paymentStatus === paymentFilter;
      return textMatch && paymentMatch;
    });
  }

  function showAdminAccess(show) {
    adminAccessDenied.classList.toggle("hidden", show);
    adminPanel.classList.toggle("hidden", !show);
  }

  function renderAdminData() {
    const totalOrders = state.orders.length;
    const totalRevenue = state.orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalPaid = state.orders.reduce((s, o) => s + Number(o.paidAmount || 0), 0);
    const uniqueCustomers = new Set(state.orders.map((o) => o.email)).size;
    const pendingPayments = state.orders.filter((o) => o.paymentStatus !== "paid").length;
    const visibleOrders = getFilteredOrders();

    kpiOrders.textContent = totalOrders;
    kpiRevenue.textContent = formatMoney(totalRevenue);
    kpiPaid.textContent = formatMoney(totalPaid);
    kpiCustomers.textContent = uniqueCustomers;
    kpiPendingPayments.textContent = pendingPayments;

    if (visibleOrders.length === 0) {
      orderTableBody.innerHTML = "<tr><td colspan='14'>Geen bestellingen voor deze filter.</td></tr>";
    } else {
      orderTableBody.innerHTML = visibleOrders.map((o, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${o.id}</strong><br>
            <button class="ghost-btn" data-copy-order-id="${o.id}">Copy</button>
          </td>
          <td>${o.fullName}</td>
          <td>${o.email}</td>
          <td>${o.eafcTag || "-"}</td>
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
                <option value="awaiting_payment" ${o.orderStatus === "awaiting_payment" ? "selected" : ""}>awaiting_payment</option>
                <option value="payment_review" ${o.orderStatus === "payment_review" ? "selected" : ""}>payment_review</option>
                <option value="paid" ${o.orderStatus === "paid" ? "selected" : ""}>paid</option>
                <option value="queued" ${o.orderStatus === "queued" ? "selected" : ""}>queued</option>
                <option value="in_progress" ${o.orderStatus === "in_progress" ? "selected" : ""}>in_progress</option>
                <option value="need_info" ${o.orderStatus === "need_info" ? "selected" : ""}>need_info</option>
                <option value="delivered" ${o.orderStatus === "delivered" ? "selected" : ""}>delivered</option>
                <option value="completed" ${o.orderStatus === "completed" ? "selected" : ""}>completed</option>
                <option value="on_hold" ${o.orderStatus === "on_hold" ? "selected" : ""}>on_hold</option>
                <option value="dispute" ${o.orderStatus === "dispute" ? "selected" : ""}>dispute</option>
                <option value="cancelled" ${o.orderStatus === "cancelled" ? "selected" : ""}>cancelled</option>
              </select>
              <button class="ghost-btn" data-save-order="${o.id}">Opslaan</button>
              <button class="ghost-btn" data-mark-paid="${o.id}">Mark paid</button>
              <button class="ghost-btn danger-btn" data-cancel-order="${o.id}">Cancel</button>
            </div>
          </td>
        </tr>
      `).join("");
    }

    if (state.accounts.length === 0) {
      accountsTableBody.innerHTML = "<tr><td colspan='5'>Nog geen accounts.</td></tr>";
    } else {
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

    if (state.products.length === 0) {
      productsTableBody.innerHTML = "<tr><td colspan='4'>Nog geen producten.</td></tr>";
    } else {
      productsTableBody.innerHTML = state.products.map((p, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${p.name}</td>
          <td>EUR ${formatMoney(p.price)}</td>
          <td>
            <button class="ghost-btn" data-edit-product="${p.id}">Edit</button>
            <button class="ghost-btn danger-btn" data-delete-product="${p.id}">Delete</button>
          </td>
        </tr>
      `).join("");
    }
  }

  function exportOrdersCsv() {
    const headers = [
      "OrderID", "VolgNr", "Klant", "Email", "EAFCID", "Items", "TotaalEUR",
      "BetaaldEUR", "OrderStatus", "PaymentStatus", "Methode", "Referentie", "Tijdstip"
    ];

    const rows = state.orders.map((o, idx) => [
      o.id,
      idx + 1,
      o.fullName,
      o.email,
      o.eafcTag || "",
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

  document.getElementById("addProductBtn").addEventListener("click", () => {
    const name = prompt("Productnaam:");
    if (!name) return;
    const priceText = prompt("Prijs in EUR (bv. 19.99):", "19.99");
    if (!priceText) return;
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      alert("Ongeldige prijs.");
      return;
    }

    state.products.push({
      id: Date.now(),
      name: name.trim(),
      price: Number(price.toFixed(2))
    });
    saveState();
    renderAdminData();
  });

  document.getElementById("exportOrdersBtn").addEventListener("click", exportOrdersCsv);
  document.getElementById("exportAccountsBtn").addEventListener("click", exportAccountsCsv);
  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    orderSearchInput.value = "";
    paymentStatusFilter.value = "all";
    renderAdminData();
  });
  orderSearchInput.addEventListener("input", renderAdminData);
  paymentStatusFilter.addEventListener("change", renderAdminData);

  orderTableBody.addEventListener("click", (e) => {
    const saveOrderId = e.target.getAttribute("data-save-order");
    const cancelOrderId = e.target.getAttribute("data-cancel-order");
    const markPaidId = e.target.getAttribute("data-mark-paid");
    const copyOrderId = e.target.getAttribute("data-copy-order-id");

    if (copyOrderId) {
      navigator.clipboard.writeText(copyOrderId)
        .then(() => alert(`Order-ID gekopieerd: ${copyOrderId}`))
        .catch(() => alert(`Copy mislukt. Gebruik handmatig dit ID: ${copyOrderId}`));
      return;
    }

    if (saveOrderId) {
      const selectEl = document.querySelector(`select[data-order-status="${saveOrderId}"]`);
      if (!selectEl) return;
      const order = state.orders.find((o) => o.id === saveOrderId);
      if (!order) return;
      order.orderStatus = selectEl.value;
      saveState();
      renderAdminData();
      return;
    }

    if (cancelOrderId) {
      const order = state.orders.find((o) => o.id === cancelOrderId);
      if (!order) return;
      order.orderStatus = "cancelled";
      saveState();
      renderAdminData();
      return;
    }

    if (markPaidId) {
      const order = state.orders.find((o) => o.id === markPaidId);
      if (!order) return;
      order.paymentStatus = "paid";
      order.paidAmount = Number(order.total || 0);
      saveState();
      renderAdminData();
    }
  });

  productsTableBody.addEventListener("click", (e) => {
    const editId = Number(e.target.getAttribute("data-edit-product"));
    const deleteId = Number(e.target.getAttribute("data-delete-product"));

    if (editId) {
      const product = state.products.find((p) => p.id === editId);
      if (!product) return;
      const newName = prompt("Nieuwe naam:", product.name);
      if (!newName) return;
      const newPriceText = prompt("Nieuwe prijs (EUR):", String(product.price));
      if (!newPriceText) return;
      const newPrice = Number(newPriceText);
      if (!Number.isFinite(newPrice) || newPrice <= 0) {
        alert("Ongeldige prijs.");
        return;
      }
      product.name = newName.trim();
      product.price = Number(newPrice.toFixed(2));
      saveState();
      renderAdminData();
      return;
    }

    if (deleteId) {
      state.products = state.products.filter((p) => p.id !== deleteId);
      saveState();
      renderAdminData();
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
ensureTestProduct();
saveState();

if (PAGE === "shop") {
  renderShop();
}

if (PAGE === "admin") {
  renderAdminPage();
}
