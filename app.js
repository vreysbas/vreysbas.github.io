const ADMIN_USER = "vreys.bas";
const ADMIN_PASS = "admin12345";
const PRODUCTS = [
  { id: 1, name: "Classic Hoodie", price: 59.99 },
  { id: 2, name: "Sport Sneakers", price: 89.5 },
  { id: 3, name: "Travel Backpack", price: 74.0 },
  { id: 4, name: "Daily Water Bottle", price: 24.99 }
];

const state = {
  cart: JSON.parse(localStorage.getItem("cart")) || [],
  orders: JSON.parse(localStorage.getItem("orders")) || [],
  adminLoggedIn: sessionStorage.getItem("adminLoggedIn") === "true"
};

const el = {
  productGrid: document.getElementById("productGrid"),
  cartCount: document.getElementById("cartCount"),
  cartTotal: document.getElementById("cartTotal"),
  cartItems: document.getElementById("cartItems"),
  cartPanel: document.getElementById("cartPanel"),
  checkoutModal: document.getElementById("checkoutModal"),
  adminModal: document.getElementById("adminModal"),
  adminPanel: document.getElementById("adminPanel"),
  orderTableBody: document.getElementById("orderTableBody"),
  kpiOrders: document.getElementById("kpiOrders"),
  kpiRevenue: document.getElementById("kpiRevenue"),
  kpiCustomers: document.getElementById("kpiCustomers"),
  loginError: document.getElementById("loginError")
};

function saveState() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  localStorage.setItem("orders", JSON.stringify(state.orders));
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function renderProducts() {
  el.productGrid.innerHTML = PRODUCTS.map((p) => `
    <article class="product-card">
      <h3>${p.name}</h3>
      <p class="price">EUR ${formatMoney(p.price)}</p>
      <button class="primary-btn" data-add="${p.id}">Koop nu</button>
    </article>
  `).join("");
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function renderCart() {
  el.cartCount.textContent = state.cart.reduce((n, item) => n + item.qty, 0);
  el.cartTotal.textContent = formatMoney(cartTotal());

  if (state.cart.length === 0) {
    el.cartItems.innerHTML = "<p>Je winkelmand is leeg.</p>";
    return;
  }

  el.cartItems.innerHTML = state.cart.map((item) => `
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
  const p = PRODUCTS.find((x) => x.id === Number(productId));
  if (!p) return;
  const existing = state.cart.find((x) => x.id === p.id);
  if (existing) existing.qty += 1;
  else state.cart.push({ ...p, qty: 1 });
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

function renderAdmin() {
  const totalOrders = state.orders.length;
  const totalRevenue = state.orders.reduce((s, o) => s + o.total, 0);
  const uniqueCustomers = new Set(state.orders.map((o) => o.email)).size;

  el.kpiOrders.textContent = totalOrders;
  el.kpiRevenue.textContent = formatMoney(totalRevenue);
  el.kpiCustomers.textContent = uniqueCustomers;

  if (state.orders.length === 0) {
    el.orderTableBody.innerHTML = "<tr><td colspan='7'>Nog geen bestellingen.</td></tr>";
    return;
  }

  el.orderTableBody.innerHTML = state.orders.map((o, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${o.fullName}</td>
      <td>${o.email}</td>
      <td>${o.address}</td>
      <td>${o.items.map((i) => `${i.name} (${i.qty})`).join(", ")}</td>
      <td>EUR ${formatMoney(o.total)}</td>
      <td>${new Date(o.createdAt).toLocaleString()}</td>
    </tr>
  `).join("");
}

function placeOrder(formData) {
  if (state.cart.length === 0) {
    alert("Je winkelmand is leeg.");
    return;
  }

  const order = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    address: formData.get("address"),
    items: [...state.cart],
    total: cartTotal(),
    createdAt: new Date().toISOString()
  };

  state.orders.unshift(order);
  state.cart = [];
  saveState();
  renderCart();
  renderAdmin();
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
document.getElementById("openAdminBtn").addEventListener("click", () => toggle("adminModal", true));
document.getElementById("closeAdminBtn").addEventListener("click", () => toggle("adminModal", false));

document.getElementById("checkoutForm").addEventListener("submit", (e) => {
  e.preventDefault();
  placeOrder(new FormData(e.target));
  e.target.reset();
});

document.getElementById("adminLoginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const user = data.get("username");
  const pass = data.get("password");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    state.adminLoggedIn = true;
    sessionStorage.setItem("adminLoggedIn", "true");
    toggle("adminModal", false);
    toggle("adminPanel", true);
    renderAdmin();
    el.loginError.textContent = "";
    e.target.reset();
    return;
  }

  el.loginError.textContent = "Foute logingegevens.";
});

document.getElementById("logoutAdminBtn").addEventListener("click", () => {
  state.adminLoggedIn = false;
  sessionStorage.removeItem("adminLoggedIn");
  toggle("adminPanel", false);
});

renderProducts();
renderCart();
if (state.adminLoggedIn) {
  toggle("adminPanel", true);
  renderAdmin();
}
