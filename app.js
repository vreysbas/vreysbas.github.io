const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "admin12345";
const PRODUCTS = [
  { id: 1, name: "Classic Hoodie", price: 59.99 },
  { id: 2, name: "Sport Sneakers", price: 89.5 },
  { id: 3, name: "Travel Backpack", price: 74.0 },
  { id: 4, name: "Daily Water Bottle", price: 24.99 }
];

const PAGE = document.body.dataset.page;

const state = {
  cart: JSON.parse(localStorage.getItem("cart")) || [],
  orders: JSON.parse(localStorage.getItem("orders")) || [],
  adminLoggedIn: sessionStorage.getItem("adminLoggedIn") === "true"
};

function saveState() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  localStorage.setItem("orders", JSON.stringify(state.orders));
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

function renderShop() {
  const productGrid = document.getElementById("productGrid");
  const cartCount = document.getElementById("cartCount");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");

  function renderProducts() {
    productGrid.innerHTML = PRODUCTS.map((p) => `
      <article class="product-card">
        <h3>${p.name}</h3>
        <p class="price">EUR ${formatMoney(p.price)}</p>
        <button class="primary-btn" data-add="${p.id}">Koop nu</button>
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

    const method = formData.get("paymentMethod");
    const reference = (formData.get("paymentReference") || "").trim();
    const total = cartTotal();

    const isMarkedPaid = method !== "cash" && reference.length > 0;
    const paymentStatus = isMarkedPaid ? "paid" : "pending";
    const paidAmount = isMarkedPaid ? total : 0;

    const order = {
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      address: formData.get("address"),
      items: [...state.cart],
      total,
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

  document.getElementById("checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    placeOrder(new FormData(e.target));
    e.target.reset();
  });

  renderProducts();
  renderCart();
}

function renderAdminPage() {
  const loginSection = document.getElementById("adminLoginSection");
  const adminPanel = document.getElementById("adminPanel");
  const loginError = document.getElementById("loginError");

  const kpiOrders = document.getElementById("kpiOrders");
  const kpiRevenue = document.getElementById("kpiRevenue");
  const kpiPaid = document.getElementById("kpiPaid");
  const kpiCustomers = document.getElementById("kpiCustomers");
  const orderTableBody = document.getElementById("orderTableBody");

  function showAdmin(show) {
    loginSection.classList.toggle("hidden", show);
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
      orderTableBody.innerHTML = "<tr><td colspan='11'>Nog geen bestellingen.</td></tr>";
      return;
    }

    orderTableBody.innerHTML = state.orders.map((o, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${o.fullName}</td>
        <td>${o.email}</td>
        <td>${o.address}</td>
        <td>${o.items.map((i) => `${i.name} (${i.qty})`).join(", ")}</td>
        <td>EUR ${formatMoney(o.total)}</td>
        <td>EUR ${formatMoney(o.paidAmount || 0)}</td>
        <td><span class="status-badge ${o.paymentStatus === "paid" ? "paid" : "pending"}">${o.paymentStatus}</span></td>
        <td>${o.paymentMethod || "-"}</td>
        <td>${o.paymentReference || "-"}</td>
        <td>${new Date(o.createdAt).toLocaleString()}</td>
      </tr>
    `).join("");
  }

  function exportOrdersCsv() {
    const headers = [
      "OrderNr", "Klant", "Email", "Adres", "Items", "TotaalEUR",
      "BetaaldEUR", "Status", "Methode", "Referentie", "Tijdstip"
    ];

    const rows = state.orders.map((o, idx) => [
      idx + 1,
      o.fullName,
      o.email,
      o.address,
      o.items.map((i) => `${i.name} (${i.qty})`).join(", "),
      formatMoney(o.total),
      formatMoney(o.paidAmount || 0),
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

  document.getElementById("adminLoginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const user = data.get("username");
    const pass = data.get("password");

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      state.adminLoggedIn = true;
      sessionStorage.setItem("adminLoggedIn", "true");
      loginError.textContent = "";
      e.target.reset();
      renderAdminData();
      showAdmin(true);
      return;
    }

    loginError.textContent = "Foute logingegevens.";
  });

  document.getElementById("logoutAdminBtn").addEventListener("click", () => {
    state.adminLoggedIn = false;
    sessionStorage.removeItem("adminLoggedIn");
    showAdmin(false);
  });

  document.getElementById("exportOrdersBtn").addEventListener("click", exportOrdersCsv);

  if (state.adminLoggedIn) {
    renderAdminData();
    showAdmin(true);
  } else {
    showAdmin(false);
  }
}

if (PAGE === "shop") {
  renderShop();
}

if (PAGE === "admin") {
  renderAdminPage();
}
