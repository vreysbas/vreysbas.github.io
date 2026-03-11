const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "Kleerkast0428!";
const DEFAULT_PRODUCTS = [
  { id: 1, name: "EAFC 26 Meta Guide", price: 14.99 },
  { id: 2, name: "Weekend League Coaching (30m)", price: 24.99 },
  { id: 3, name: "Custom Tactics Pack", price: 9.99 },
  { id: 4, name: "Squad Builder Review", price: 12.5 }
];

const PAGE = document.body.dataset.page;
const CLOUD_CONFIG = window.CLOUD_CONFIG || {
  enabled: false,
  provider: "firebase-rtdb",
  firebaseConfig: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    appId: ""
  },
  collection: "shopData",
  document: "global",
  path: "shopData/global"
};
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
    { id: "fullName", label: "EAFC E-mail", type: "email", placeholder: "naam@email.com", required: true, locked: true, validation: "email", masked: false },
    { id: "eafcTag", label: "Info 1.", type: "text", placeholder: "1.", required: true, locked: true, validation: "min2", masked: false },
    { id: "extraInfo2", label: "Info 2.", type: "text", placeholder: "2.", required: true, locked: true, validation: "min2", masked: false }
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

const cloudState = {
  enabled: false,
  initPromise: null,
  docRef: null,
  dataRef: null,
  unsubscribe: null,
  applyingSnapshot: false
};

let rerenderCurrentPage = () => {};

const SENSITIVE_FIELD_PATTERN = /\b(password|wachtwoord|backup\s*codes?|2fa|authenticator|recovery\s*codes?)\b/i;
const ALLOWED_FIELD_TYPES = new Set(["text", "email", "textarea"]);
const ALLOWED_VALIDATIONS = new Set(["none", "email", "containsAt", "min2", "min6"]);
const CORE_FIELD_IDS = new Set(["fullName", "eafcTag", "extraInfo2"]);

function getDefaultFieldById(fieldId) {
  return DEFAULT_CHECKOUT_CONFIG.fields.find((field) => field.id === fieldId);
}

function normalizeCheckoutFields(rawFields) {
  const baseFields = Array.isArray(rawFields) ? rawFields : [];
  const normalized = baseFields
    .map(cloneCheckoutField)
    .filter((field) => Boolean(field.id) && Boolean(field.label))
    .filter((field) => field.id !== "email")
    .map((field) => ({
      ...field,
      type: ALLOWED_FIELD_TYPES.has(field.type) ? field.type : "text",
      validation: ALLOWED_VALIDATIONS.has(field.validation) ? field.validation : "none",
      masked: field.type === "textarea" ? false : Boolean(field.masked)
    }));

  for (const coreId of CORE_FIELD_IDS) {
    if (!normalized.some((field) => field.id === coreId)) {
      const fallback = getDefaultFieldById(coreId);
      if (fallback) normalized.push(cloneCheckoutField(fallback));
    }
  }

  return normalized.map((field) => {
    if (!CORE_FIELD_IDS.has(field.id)) return field;
    const fallback = getDefaultFieldById(field.id);
    return {
      ...field,
      type: fallback?.type || field.type,
      required: true,
      locked: true,
      validation: ALLOWED_VALIDATIONS.has(field.validation) ? field.validation : (fallback?.validation || "none")
    };
  });
}

function cloneCheckoutField(field) {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    placeholder: field.placeholder || "",
    required: Boolean(field.required),
    locked: Boolean(field.locked),
    validation: String(field.validation || "none"),
    masked: Boolean(field.masked)
  };
}

function normalizeCheckoutConfig(input) {
  const source = input || {};
  const fields = normalizeCheckoutFields(
    Array.isArray(source.fields) && source.fields.length > 0
      ? source.fields
      : DEFAULT_CHECKOUT_CONFIG.fields
  );

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

function cloudAvailable() {
  if (!CLOUD_CONFIG.enabled || !window.firebase) return false;

  if (CLOUD_CONFIG.provider === "firebase-firestore") {
    return Boolean(window.firebase.firestore);
  }

  if (CLOUD_CONFIG.provider === "firebase-rtdb") {
    return Boolean(window.firebase.database);
  }

  return Boolean(
    CLOUD_CONFIG.enabled
  );
}

async function initCloud() {
  if (cloudState.initPromise) return cloudState.initPromise;

  cloudState.initPromise = (async () => {
    if (!cloudAvailable()) return false;

    const hasApp = window.firebase.apps && window.firebase.apps.length > 0;
    const app = hasApp
      ? window.firebase.app()
      : window.firebase.initializeApp(CLOUD_CONFIG.firebaseConfig);

    if (CLOUD_CONFIG.provider === "firebase-firestore") {
      const db = window.firebase.firestore(app);
      cloudState.docRef = db
        .collection(CLOUD_CONFIG.collection || "shopData")
        .doc(CLOUD_CONFIG.document || "global");
    }

    if (CLOUD_CONFIG.provider === "firebase-rtdb") {
      const db = window.firebase.database(app);
      cloudState.dataRef = db.ref(CLOUD_CONFIG.path || "shopData/global");
    }

    cloudState.enabled = true;
    return true;
  })();

  return cloudState.initPromise;
}

function applyCloudPayload(payload) {
  if (!payload) return;
  if (Array.isArray(payload.orders)) state.orders = payload.orders;
  if (Array.isArray(payload.accounts)) state.accounts = payload.accounts;
  if (Array.isArray(payload.products)) state.products = payload.products;
  if (payload.checkoutConfig) state.checkoutConfig = normalizeCheckoutConfig(payload.checkoutConfig);
}

async function loadStateFromCloudOnce() {
  const ready = await initCloud();
  if (!ready) return;

  try {
    let payload = null;

    if (CLOUD_CONFIG.provider === "firebase-firestore" && cloudState.docRef) {
      const snap = await cloudState.docRef.get();
      if (snap.exists) payload = snap.data()?.state;
    }

    if (CLOUD_CONFIG.provider === "firebase-rtdb" && cloudState.dataRef) {
      const snap = await cloudState.dataRef.get();
      payload = snap.exists() ? snap.val()?.state : null;
    }

    if (!payload) return;

    applyCloudPayload(payload);
    saveStateLocal();
  } catch (error) {
    console.error("Cloud load failed:", error);
  }
}

async function saveStateToCloud() {
  const ready = await initCloud();
  if (!ready || cloudState.applyingSnapshot) return;

  const payload = {
    state: {
      orders: state.orders,
      accounts: state.accounts,
      products: state.products,
      checkoutConfig: state.checkoutConfig,
      updatedAt: new Date().toISOString()
    }
  };

  try {
    if (CLOUD_CONFIG.provider === "firebase-firestore" && cloudState.docRef) {
      await cloudState.docRef.set(payload, { merge: true });
    }

    if (CLOUD_CONFIG.provider === "firebase-rtdb" && cloudState.dataRef) {
      await cloudState.dataRef.set(payload);
    }
  } catch (error) {
    console.error("Cloud save failed:", error);
  }
}

async function startCloudRealtimeSync() {
  const ready = await initCloud();
  if (!ready || cloudState.unsubscribe) return;

  if (CLOUD_CONFIG.provider === "firebase-firestore" && cloudState.docRef) {
    cloudState.unsubscribe = cloudState.docRef.onSnapshot((snap) => {
      const payload = snap.data()?.state;
      if (!payload) return;
      cloudState.applyingSnapshot = true;
      applyCloudPayload(payload);
      saveStateLocal();
      rerenderCurrentPage();
      cloudState.applyingSnapshot = false;
    });
  }

  if (CLOUD_CONFIG.provider === "firebase-rtdb" && cloudState.dataRef) {
    const handler = (snap) => {
      const payload = snap.val()?.state;
      if (!payload) return;
      cloudState.applyingSnapshot = true;
      applyCloudPayload(payload);
      saveStateLocal();
      rerenderCurrentPage();
      cloudState.applyingSnapshot = false;
    };
    cloudState.dataRef.on("value", handler);
    cloudState.unsubscribe = () => cloudState.dataRef.off("value", handler);
  }
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

function saveStateLocal() {
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

function saveState() {
  saveStateLocal();
  void saveStateToCloud();
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

function validateFieldRule(value, field) {
  if (!field.required && !value) return "";

  switch (field.validation) {
    case "email":
      return isValidEmail(value) ? "" : `${field.label} moet een geldig e-mailadres zijn.`;
    case "containsAt":
      return value.includes("@") ? "" : `${field.label} moet minstens een @ bevatten.`;
    case "min2":
      return value.length >= 2 ? "" : `${field.label} moet minstens 2 tekens hebben.`;
    case "min6":
      return value.length >= 6 ? "" : `${field.label} moet minstens 6 tekens hebben.`;
    default:
      return "";
  }
}

function renderShop() {
  const productGrid = document.getElementById("productGrid");
  const cartCount = document.getElementById("cartCount");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");
  const customerOrdersList = document.getElementById("customerOrdersList");
  const orderActionConfirmModal = document.getElementById("orderActionConfirmModal");
  const orderActionConfirmTitle = document.getElementById("orderActionConfirmTitle");
  const orderActionConfirmMessage = document.getElementById("orderActionConfirmMessage");
  const confirmOrderActionBtn = document.getElementById("confirmOrderActionBtn");
  const cancelOrderActionBtn = document.getElementById("cancelOrderActionBtn");
  const checkoutPaidBtn = document.getElementById("checkoutPaidBtn");
  const checkoutCancelBtn = document.getElementById("checkoutCancelBtn");
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
  let pendingOrderAction = null;
  let latestCheckoutOrderId = null;

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
      const safeLabel = escapeHtml(field.label || "Veld");
      const safePlaceholder = escapeHtml(field.placeholder || "");
      if (field.type === "textarea") {
        return `
          <label>${safeLabel}
            <textarea name="${field.id}" rows="3" ${field.required ? "required" : ""} placeholder="${safePlaceholder}"></textarea>
          </label>
        `;
      }

      const inputType = field.masked ? "password" : field.type;
      const inputId = `checkout-input-${field.id}`;

      return `
        <label>${safeLabel}
          <div class="input-with-toggle">
            <input id="${inputId}" name="${field.id}" type="${inputType}" ${field.required ? "required" : ""} placeholder="${safePlaceholder}">
            ${field.masked ? `<button type="button" class="ghost-btn small-toggle-btn" data-toggle-mask="${inputId}">Oogje</button>` : ""}
          </div>
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
      const matchesLoggedInEmail = Boolean(state.currentUser?.email) && order.email === state.currentUser.email;
      const matchesLocalOrder = storedOrderIds.includes(order.id);
      return matchesLoggedInEmail || matchesLocalOrder;
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
          ${order.adminNote ? `<span><strong>Admin notitie:</strong> ${escapeHtml(order.adminNote)}</span>` : ""}
        </div>
      </article>
    `).join("");
  }

  function openOrderActionConfirm(action, orderId) {
    pendingOrderAction = { action, orderId };
    if (action === "cancelled") {
      orderActionConfirmTitle.textContent = "Bevestig annulering";
      orderActionConfirmMessage.textContent = `Wil je order ${orderId} afbreken of verderzetten?`;
      confirmOrderActionBtn.textContent = "Order afbreken";
      cancelOrderActionBtn.textContent = "Verderzetten";
    }
    toggle("orderActionConfirmModal", true);
  }

  function applyOrderAction() {
    if (!pendingOrderAction) return;
    const { action, orderId } = pendingOrderAction;
    const order = state.orders.find((x) => x.id === orderId);
    if (!order) {
      toggle("orderActionConfirmModal", false);
      pendingOrderAction = null;
      return;
    }

    if (action === "cancelled") {
      order.orderStatus = "cancelled";
      order.paymentStatus = order.paymentStatus === "paid" ? "paid" : "cancelled";
      order.paymentReference = `${order.paymentReference || ""} | klant: I cancelled @ ${new Date().toLocaleString()}`.trim();
      toggle("checkoutModal", false);
      toggle("ordersPanel", true);
    }

    saveState();
    renderCustomerOrders();
    cancelOrderActionBtn.textContent = "Annuleren";
    toggle("orderActionConfirmModal", false);
    pendingOrderAction = null;
  }

  function markLatestOrderAsPaidByCustomer() {
    if (!latestCheckoutOrderId) {
      alert("Maak eerst een order aan voor je op I paid drukt.");
      return;
    }

    const order = state.orders.find((x) => x.id === latestCheckoutOrderId);
    if (!order) {
      alert("Order niet gevonden.");
      return;
    }

    order.orderStatus = order.orderStatus === "awaiting_payment" ? "payment_review" : order.orderStatus;
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "payment_review";
    }
    order.paymentReference = `${order.paymentReference || ""} | klant: I paid @ ${new Date().toLocaleString()}`.trim();
    saveState();

    toggle("checkoutModal", false);
    renderCustomerOrders();
    toggle("ordersPanel", true);
    alert("Betaling gemeld. Je order staat nu op payment_review.");
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

    const primaryEmail = String(formData.get("fullName") || "").trim();
    const extraField1 = String(formData.get("eafcTag") || "").trim();
    const extraField2 = String(formData.get("extraInfo2") || "").trim();
    const noRefundAck = formData.get("noRefundAck") === "on";

    for (const field of state.checkoutConfig.fields) {
      const value = getCheckoutFieldValue(field, formData);
      const validationError = validateFieldRule(value, field);
      if (validationError) {
        alert(validationError);
        return null;
      }
    }

    if (!noRefundAck) {
      alert("Je moet bevestigen dat foutieve betalingen niet terugbetaald worden.");
      return null;
    }

    const customFields = state.checkoutConfig.fields
      .filter((field) => !["fullName", "eafcTag", "extraInfo2"].includes(field.id))
      .map((field) => ({
        id: field.id,
        label: field.label,
        value: getCheckoutFieldValue(field, formData)
      }))
      .filter((field) => field.value);

    customFields.unshift(
      { id: "extraInfo1", label: "Extra veld 1", value: extraField1 },
      { id: "extraInfo2", label: "Extra veld 2", value: extraField2 }
    );

    return {
      fullName: primaryEmail,
      email: primaryEmail,
      eafcTag: extraField1,
      customFields
    };
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
    latestCheckoutOrderId = order.id;
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
    const toggleMaskId = e.target.getAttribute("data-toggle-mask");
    if (add) addToCart(add);
    if (remove) removeFromCart(remove);
    if (toggleMaskId) {
      const input = document.getElementById(toggleMaskId);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    }
  });

  document.getElementById("openCartBtn").addEventListener("click", () => toggle("cartPanel", true));
  document.getElementById("closeCartBtn").addEventListener("click", () => toggle("cartPanel", false));
  document.getElementById("openOrdersBtn").addEventListener("click", () => {
    renderCustomerOrders();
    toggle("ordersPanel", true);
  });
  document.getElementById("closeOrdersBtn").addEventListener("click", () => toggle("ordersPanel", false));
  checkoutPaidBtn.addEventListener("click", markLatestOrderAsPaidByCustomer);
  checkoutCancelBtn.addEventListener("click", () => {
    if (!latestCheckoutOrderId) {
      alert("Maak eerst een order aan voor je op Cancel drukt.");
      return;
    }
    openOrderActionConfirm("cancelled", latestCheckoutOrderId);
  });
  document.getElementById("closeOrderActionConfirmBtn").addEventListener("click", () => {
    pendingOrderAction = null;
    cancelOrderActionBtn.textContent = "Annuleren";
    toggle("orderActionConfirmModal", false);
  });
  document.getElementById("cancelOrderActionBtn").addEventListener("click", () => {
    pendingOrderAction = null;
    cancelOrderActionBtn.textContent = "Annuleren";
    toggle("orderActionConfirmModal", false);
  });
  confirmOrderActionBtn.addEventListener("click", applyOrderAction);
  document.getElementById("checkoutBtn").addEventListener("click", () => {
    if (!state.currentUser) {
      authError.textContent = "Log eerst in om een bestelling te plaatsen.";
      toggle("authModal", true);
      return;
    }
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

  rerenderCurrentPage = rerenderShop;

  window.addEventListener("storage", rerenderShop);
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
          <div class="field-order-actions">
            <button type="button" class="ghost-btn" data-move-field-up="${field.id}">Omhoog</button>
            <button type="button" class="ghost-btn" data-move-field-down="${field.id}">Omlaag</button>
          </div>
          <label>Label
            <input data-field-id="${field.id}" data-prop="label" value="${escapeHtml(field.label)}">
          </label>
          <label>Placeholder
            <input data-field-id="${field.id}" data-prop="placeholder" value="${escapeHtml(field.placeholder || "")}">
          </label>
          <label>Validatie
            <select data-field-id="${field.id}" data-prop="validation">
              <option value="none" ${field.validation === "none" ? "selected" : ""}>Geen</option>
              <option value="email" ${field.validation === "email" ? "selected" : ""}>Geldig e-mailformaat</option>
              <option value="containsAt" ${field.validation === "containsAt" ? "selected" : ""}>Minstens @</option>
              <option value="min2" ${field.validation === "min2" ? "selected" : ""}>Minstens 2 tekens</option>
              <option value="min6" ${field.validation === "min6" ? "selected" : ""}>Minstens 6 tekens</option>
            </select>
          </label>
          <label class="checkbox-line compact">
            <input type="checkbox" data-field-id="${field.id}" data-prop="masked" ${field.masked ? "checked" : ""}>
            Verberg input + oogje
          </label>
        </div>
      `).join("");

      extraCheckoutFieldsList.innerHTML = extraFields.length === 0
        ? "<p class='small-line'>Nog geen extra velden.</p>"
        : extraFields.map((field) => `
          <div class="checkout-field-editor" data-extra-row="${field.id}">
            <span class="field-chip">Extra veld</span>
            <div class="field-order-actions">
              <button type="button" class="ghost-btn" data-move-field-up="${field.id}">Omhoog</button>
              <button type="button" class="ghost-btn" data-move-field-down="${field.id}">Omlaag</button>
            </div>
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
            <label>Validatie
              <select data-field-id="${field.id}" data-prop="validation">
                <option value="none" ${field.validation === "none" ? "selected" : ""}>Geen</option>
                <option value="email" ${field.validation === "email" ? "selected" : ""}>Geldig e-mailformaat</option>
                <option value="containsAt" ${field.validation === "containsAt" ? "selected" : ""}>Minstens @</option>
                <option value="min2" ${field.validation === "min2" ? "selected" : ""}>Minstens 2 tekens</option>
                <option value="min6" ${field.validation === "min6" ? "selected" : ""}>Minstens 6 tekens</option>
              </select>
            </label>
            <label class="checkbox-line compact">
              <input type="checkbox" data-field-id="${field.id}" data-prop="required" ${field.required ? "checked" : ""}>
              Verplicht
            </label>
            <label class="checkbox-line compact">
              <input type="checkbox" data-field-id="${field.id}" data-prop="masked" ${field.masked ? "checked" : ""}>
              Verberg input + oogje
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
          required: requiredInput ? requiredInput.checked : field.required,
          validation: String(checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="validation"]`)?.value || field.validation || "none"),
          masked: Boolean(checkoutConfigForm.querySelector(`[data-field-id="${field.id}"][data-prop="masked"]`)?.checked)
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
      orderTableBody.innerHTML = "<tr><td colspan='15'>Geen bestellingen voor deze filter.</td></tr>";
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
          <td>
            <textarea rows="3" data-order-note="${o.id}" placeholder="Interne notitie voor dit order...">${escapeHtml(o.adminNote || "")}</textarea>
          </td>
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
      locked: false,
      validation: "none",
      masked: false
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
  checkoutConfigForm.addEventListener("click", (e) => {
    const moveUpId = e.target.getAttribute("data-move-field-up");
    const moveDownId = e.target.getAttribute("data-move-field-down");

    if (moveUpId) {
      const idx = state.checkoutConfig.fields.findIndex((field) => field.id === moveUpId);
      if (idx > 0) {
        const temp = state.checkoutConfig.fields[idx - 1];
        state.checkoutConfig.fields[idx - 1] = state.checkoutConfig.fields[idx];
        state.checkoutConfig.fields[idx] = temp;
        renderCheckoutConfigEditor();
      }
      return;
    }

    if (moveDownId) {
      const idx = state.checkoutConfig.fields.findIndex((field) => field.id === moveDownId);
      if (idx >= 0 && idx < state.checkoutConfig.fields.length - 1) {
        const temp = state.checkoutConfig.fields[idx + 1];
        state.checkoutConfig.fields[idx + 1] = state.checkoutConfig.fields[idx];
        state.checkoutConfig.fields[idx] = temp;
        renderCheckoutConfigEditor();
      }
    }
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
      const noteEl = document.querySelector(`textarea[data-order-note="${saveOrderId}"]`);
      if (!selectEl) return;
      const order = state.orders.find((o) => o.id === saveOrderId);
      if (!order) return;
      order.orderStatus = selectEl.value;
      order.adminNote = String(noteEl?.value || "").trim();
      if (order.orderStatus === "paid") {
        order.paymentStatus = "paid";
        order.paidAmount = Number(order.total || 0);
      }
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
      const noteEl = document.querySelector(`textarea[data-order-note="${markPaidId}"]`);
      order.paymentStatus = "paid";
      order.paidAmount = Number(order.total || 0);
      order.orderStatus = "paid";
      order.adminNote = String(noteEl?.value || order.adminNote || "").trim();
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

  rerenderCurrentPage = rerenderAdmin;

  window.addEventListener("storage", rerenderAdmin);
}

async function bootstrap() {
  await loadStateFromCloudOnce();

  ensureDefaultAdminAccount();
  ensureTestProduct();
  saveState();

  if (PAGE === "shop") {
    renderShop();
  }

  if (PAGE === "admin") {
    renderAdminPage();
  }

  await startCloudRealtimeSync();
}

void bootstrap();
