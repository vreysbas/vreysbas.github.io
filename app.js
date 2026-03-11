const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "Kleerkast0428!";
const DEFAULT_PRODUCTS = [
  { id: 1, name: "EAFC 26 Meta Guide", price: 14.99 },
  { id: 2, name: "Weekend League Coaching (30m)", price: 24.99 },
  { id: 3, name: "Custom Tactics Pack", price: 9.99 },
  { id: 4, name: "Squad Builder Review", price: 12.5 }
];

const PAGE = document.body.dataset.page;
const MAIL_CONFIG = window.MAIL_CONFIG || {
  enabled: false,
  provider: "web3forms",
  accessKey: "",
  ownerEmail: "",
  fromName: "EAFC 26 Hub",
  fromEmail: "no-reply@example.com",
  replyTo: ""
};
const DEFAULT_CHECKOUT_CONFIG = {
  paymentNote: "Betalen gebeurt manueel via PayPal naar congaxd@gmail.com met je order-ID in de beschrijving. Zo kunnen we betalingen correct koppelen.",
  paypalEmail: "congaxd@gmail.com",
  refundWarning: "Als je fout betaalt (verkeerd bedrag, verkeerde ontvanger of zonder correct order-ID), is er geen refund mogelijk.",
  instructionIntro: "Volg exact deze stappen om problemen te vermijden:",
  instructionSteps: [
    "Open PayPal en kies geld verzenden.",
    "Stuur exact het orderbedrag naar congaxd@gmail.com.",
    "Zet je order-ID in de beschrijving.",
    "Bij fouten in bedrag, ontvanger of beschrijving is er geen refund mogelijk.",
    "Na betaling controleren wij handmatig en zetten we je order op betaald."
  ],
  fields: [
    { id: "fullName", label: "Volledige naam", type: "text", placeholder: "", required: true, locked: true },
    { id: "email", label: "E-mail", type: "email", placeholder: "", required: true, locked: true },
    { id: "eafcTag", label: "EAFC gebruikersnaam", type: "text", placeholder: "bv. VreysBas", required: true, locked: true }
  ]
};

const state = {
  cart: JSON.parse(localStorage.getItem("cart")) || [],
  orders: JSON.parse(localStorage.getItem("orders")) || [],
  accounts: JSON.parse(localStorage.getItem("accounts")) || [],
  products: JSON.parse(localStorage.getItem("products")) || DEFAULT_PRODUCTS,
  checkoutConfig: null,
  currentUser: JSON.parse(sessionStorage.getItem("currentUser") || "null")
};

const SENSITIVE_FIELD_PATTERN = /\b(password|wachtwoord|backup\s*codes?|2fa|authenticator|recovery\s*codes?)\b/i;

function cloneCheckoutField(field) {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    placeholder: field.placeholder || "",
    required: Boolean(field.required),
    locked: Boolean(field.locked)
  };
}

function normalizeCheckoutConfig(input) {
  const source = input || {};
  const fields = Array.isArray(source.fields) && source.fields.length > 0
    ? source.fields.map(cloneCheckoutField)
    : DEFAULT_CHECKOUT_CONFIG.fields.map(cloneCheckoutField);

  return {
    paymentNote: String(source.paymentNote || DEFAULT_CHECKOUT_CONFIG.paymentNote),
    paypalEmail: String(source.paypalEmail || DEFAULT_CHECKOUT_CONFIG.paypalEmail),
    refundWarning: String(source.refundWarning || DEFAULT_CHECKOUT_CONFIG.refundWarning),
    instructionIntro: String(source.instructionIntro || DEFAULT_CHECKOUT_CONFIG.instructionIntro),
    instructionSteps: Array.isArray(source.instructionSteps) && source.instructionSteps.length > 0
      ? source.instructionSteps.map((step) => String(step).trim()).filter(Boolean)
      : [...DEFAULT_CHECKOUT_CONFIG.instructionSteps],
    fields
  };
}

state.checkoutConfig = normalizeCheckoutConfig(JSON.parse(localStorage.getItem("checkoutConfig") || "null"));

function hydrateStateFromStorage() {
  state.cart = JSON.parse(localStorage.getItem("cart") || "[]");
  state.orders = JSON.parse(localStorage.getItem("orders") || "[]");
  state.accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
  state.products = JSON.parse(localStorage.getItem("products") || JSON.stringify(DEFAULT_PRODUCTS));
  state.checkoutConfig = normalizeCheckoutConfig(JSON.parse(localStorage.getItem("checkoutConfig") || "null"));
  state.currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
}

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
  localStorage.setItem("checkoutConfig", JSON.stringify(state.checkoutConfig));
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCheckoutFieldValue(configField, formData) {
  return String(formData.get(configField.id) || "").trim();
}

function renderShop() {
  const productGrid = document.getElementById("productGrid");
  const cartCount = document.getElementById("cartCount");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");
  const customerOrdersList = document.getElementById("customerOrdersList");
  const checkoutFieldsContainer = document.getElementById("checkoutFieldsContainer");
  const storePaymentNote = document.getElementById("storePaymentNote");
  const refundWarningText = document.getElementById("refundWarningText");
  const instructionIntro = document.getElementById("instructionIntro");
  const instructionList = document.getElementById("instructionList");
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

  function renderCheckoutConfig() {
    storePaymentNote.textContent = state.checkoutConfig.paymentNote;
    refundWarningText.textContent = state.checkoutConfig.refundWarning;
    instructionIntro.textContent = state.checkoutConfig.instructionIntro;
    instructionList.innerHTML = state.checkoutConfig.instructionSteps
      .map((step) => `<li>${escapeHtml(step)}</li>`)
      .join("");

    checkoutFieldsContainer.innerHTML = state.checkoutConfig.fields.map((field) => {
      const safePlaceholder = escapeHtml(field.placeholder || "");
      if (field.type === "textarea") {
        return `
          <label>${safeLabel}
            <textarea name="${field.id}" rows="3" ${field.required ? "required" : ""} placeholder="${safePlaceholder}"></textarea>
          </label>
        `;
      }

      return `
        <label>${safeLabel}
          <input name="${field.id}" type="${field.type}" ${field.required ? "required" : ""} placeholder="${safePlaceholder}">
        </label>
      `;
    }).join("");
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
             <span><strong>Uitleg:</strong> ${order.paymentStatus === "paid" ? "Betaling ontvangen, check de orderstatus voor de voortgang." : `Betaal handmatig naar ${state.checkoutConfig.paypalEmail} met dit order-ID in de beschrijving.`}</span>
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

    const customFields = state.checkoutConfig.fields
      .filter((field) => !["fullName", "email", "eafcTag"].includes(field.id))
      .map((field) => ({
        id: field.id,
        label: field.label,
        value: getCheckoutFieldValue(field, formData)
      }))
      .filter((field) => field.value);

    return { fullName, email, eafcTag, customFields };
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
      customFields: checkoutData.customFields,
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
      <strong>PayPal account:</strong> ${escapeHtml(state.checkoutConfig.paypalEmail)}<br>
      <strong>Order-ID voor beschrijving:</strong> ${order.id}<br>
      <strong>Belangrijk:</strong> Zonder dit order-ID in de beschrijving kunnen we je betaling niet koppelen.<br>
      <strong>Refund policy:</strong> ${escapeHtml(state.checkoutConfig.refundWarning)}
    `;

    sendNotificationEmail({
      toEmail: order.email,
      toName: order.fullName,
      subject: `EAFC 26 Hub - Bevestiging bestelling ${order.id}`,
      message: `Beste ${order.fullName},\n\nBedankt voor je bestelling bij EAFC 26 Hub.\n\nBestelgegevens\n- Bestelnummer: ${order.id}\n- Datum: ${new Date(order.createdAt).toLocaleString()}\n- Totaalbedrag: EUR ${formatMoney(order.total)}\n- EAFC gebruikersnaam: ${order.eafcTag}\n- Betaalmethode: Manuele PayPal overschrijving\n\nBetaal nu naar: ${state.checkoutConfig.paypalEmail}\nVermeld verplicht dit order-ID in de beschrijving: ${order.id}\n\nRefund policy: ${state.checkoutConfig.refundWarning}\n\nNa controle zetten we je order op betaald.\n\nMet vriendelijke groeten,\nEAFC 26 Hub`
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
  renderCheckoutConfig();
  renderCustomerOrders();
  updateAuthUi();

  const rerenderShop = () => {
    hydrateStateFromStorage();
    renderProducts();
    renderCart();
    renderCheckoutConfig();
    renderCustomerOrders();
    updateAuthUi();
  };

  window.addEventListener("storage", rerenderShop);
  window.setInterval(rerenderShop, 4000);
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
    const checkoutConfigForm = document.getElementById("checkoutConfigForm");
    const configPaymentNote = document.getElementById("configPaymentNote");
    const configPaypalEmail = document.getElementById("configPaypalEmail");
    const configRefundWarning = document.getElementById("configRefundWarning");
    const configInstructionIntro = document.getElementById("configInstructionIntro");
    const configInstructionSteps = document.getElementById("configInstructionSteps");
    const coreCheckoutFieldsList = document.getElementById("coreCheckoutFieldsList");
    const extraCheckoutFieldsList = document.getElementById("extraCheckoutFieldsList");

    function renderCheckoutConfigEditor() {
      configPaymentNote.value = state.checkoutConfig.paymentNote;
      configPaypalEmail.value = state.checkoutConfig.paypalEmail;
      configRefundWarning.value = state.checkoutConfig.refundWarning;
      configInstructionIntro.value = state.checkoutConfig.instructionIntro;
      configInstructionSteps.value = state.checkoutConfig.instructionSteps.join("\n");

      const coreFields = state.checkoutConfig.fields.filter((field) => field.locked);
      const extraFields = state.checkoutConfig.fields.filter((field) => !field.locked);

      coreCheckoutFieldsList.innerHTML = coreFields.map((field) => `
        <div class="checkout-field-editor">
          <span class="field-chip">Vast veld</span>
          <label>Label
            <input data-field-id="${field.id}" data-prop="label" value="${escapeHtml(field.label)}">
          </label>
          <label>Placeholder
            <input data-field-id="${field.id}" data-prop="placeholder" value="${escapeHtml(field.placeholder || "")}">
          </label>
        </div>
      `).join("");

      extraCheckoutFieldsList.innerHTML = extraFields.length === 0
        ? "<p class='small-line'>Nog geen extra velden.</p>"
        : extraFields.map((field) => `
          <div class="checkout-field-editor" data-extra-row="${field.id}">
            <span class="field-chip">Extra veld</span>
            <label>Label
              <input data-field-id="${field.id}" data-prop="label" value="${escapeHtml(field.label)}">
            </label>
            <label>Type
              <select data-field-id="${field.id}" data-prop="type">
                <option value="text" ${field.type === "text" ? "selected" : ""}>text</option>
                <option value="email" ${field.type === "email" ? "selected" : ""}>email</option>
                <option value="textarea" ${field.type === "textarea" ? "selected" : ""}>textarea</option>
              </select>
            </label>
            <label>Placeholder
              <input data-field-id="${field.id}" data-prop="placeholder" value="${escapeHtml(field.placeholder || "")}">
            </label>
            <label class="checkbox-line compact">
              <input type="checkbox" data-field-id="${field.id}" data-prop="required" ${field.required ? "checked" : ""}>
              Verplicht
            </label>
            <button type="button" class="ghost-btn danger-btn" data-remove-checkout-field="${field.id}">Verwijder</button>
          </div>
        `).join("");
    }

    function validateCheckoutFieldSafety(field) {
      return !SENSITIVE_FIELD_PATTERN.test(field.label);
    }

    function saveCheckoutConfigFromEditor() {
      const updatedFields = state.checkoutConfig.fields.map((field) => {
        const labelInput = checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="label"]`);
        const placeholderInput = checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="placeholder"]`);
        const typeInput = checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="type"]`);
        const requiredInput = checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="required"]`);

        return {
          ...field,
          label: String(labelInput?.value || field.label).trim(),
          placeholder: String(placeholderInput?.value || "").trim(),
          type: String(typeInput?.value || field.type),
          required: requiredInput ? requiredInput.checked : field.required
        };
      });

      if (updatedFields.some((field) => !field.label)) {
        alert("Elk checkout veld moet een label hebben.");
        return;
      }

      if (updatedFields.some((field) => !validateCheckoutFieldSafety(field))) {
        alert("Een of meer checkout velden worden niet ondersteund. Kies een gewone label/placeholder.");
        return;
      }

      state.checkoutConfig = normalizeCheckoutConfig({
        paymentNote: configPaymentNote.value.trim(),
        paypalEmail: configPaypalEmail.value.trim(),
        refundWarning: configRefundWarning.value.trim(),
        instructionIntro: configInstructionIntro.value.trim(),
        instructionSteps: configInstructionSteps.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        fields: updatedFields
      });

      saveState();
      renderCheckoutConfigEditor();
      alert("Checkout instellingen opgeslagen.");
    }

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
              <button class="ghost-btn danger-btn" data-delete-order="${o.id}">Delete</button>
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
  document.getElementById("addCheckoutFieldBtn").addEventListener("click", () => {
    state.checkoutConfig.fields.push({
      id: `custom_${Date.now()}`,
      label: "Nieuw veld",
      type: "text",
      placeholder: "",
      required: false,
      locked: false
    });
    renderCheckoutConfigEditor();
  });
  checkoutConfigForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCheckoutConfigFromEditor();
  });
  extraCheckoutFieldsList.addEventListener("click", (e) => {
    const removeId = e.target.getAttribute("data-remove-checkout-field");
    if (!removeId) return;
    state.checkoutConfig.fields = state.checkoutConfig.fields.filter((field) => field.id !== removeId);
    renderCheckoutConfigEditor();
  });
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
    const deleteOrderId = e.target.getAttribute("data-delete-order");

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
      if (order.orderStatus === "awaiting_payment") {
        order.orderStatus = "payment_review";
      }
      saveState();
      renderAdminData();
      return;
    }

    if (deleteOrderId) {
      const order = state.orders.find((o) => o.id === deleteOrderId);
      if (!order) return;
      if (!confirm(`Verwijder order ${deleteOrderId} definitief uit het systeem?`)) {
        return;
      }
      state.orders = state.orders.filter((o) => o.id !== deleteOrderId);
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
    renderCheckoutConfigEditor();
    renderAdminData();
    showAdminAccess(true);
  } else {
    showAdminAccess(false);
  }

  const rerenderAdmin = () => {
    hydrateStateFromStorage();
    if (state.currentUser?.isAdmin) {
      renderCheckoutConfigEditor();
      renderAdminData();
      showAdminAccess(true);
    } else {
      showAdminAccess(false);
    }
  };

  window.addEventListener("storage", rerenderAdmin);
  window.setInterval(rerenderAdmin, 4000);
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
