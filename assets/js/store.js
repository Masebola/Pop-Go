/* ============================================================
   Pop & Go — Data Store (localStorage)
   Seeds real figures from the business pitch, then persists all
   admin changes to localStorage. Shared by public + admin pages.
   ============================================================ */

(function () {
  "use strict";

  const KEYS = {
    products: "pg_products",
    inventory: "pg_inventory",
    sales: "pg_sales",
    session: "pg_session",
    seeded: "pg_seeded_v1",
  };

  /* ---------- Seed data (from the Pop & Go pitch deck) ---------- */
  const SEED_PRODUCTS = [
    {
      id: "p-butter",
      name: "Classic Butter",
      flavour: "Buttery Salted",
      image: "/images/flavour-butter.png",
      cost: 3.02,      // total cost / bag
      price: 5.0,      // selling price / bag
      active: true,
      popular: true,
      description: "Our signature freshly popped popcorn with real butter and a pinch of salt.",
    },
    {
      id: "p-caramel",
      name: "Golden Caramel",
      flavour: "Sweet Caramel",
      image: "/images/flavour-caramel.png",
      cost: 3.35,
      price: 6.0,
      active: true,
      popular: false,
      description: "Crunchy popcorn coated in a glossy homemade caramel glaze.",
    },
    {
      id: "p-cheese",
      name: "Cheesy Pop",
      flavour: "Cheese",
      image: "/images/flavour-cheese.png",
      cost: 3.4,
      price: 6.0,
      active: true,
      popular: false,
      description: "Savoury cheese-seasoned popcorn for the salty snack lovers.",
    },
    {
      id: "p-sweetsalt",
      name: "Sweet & Salt",
      flavour: "Sweet & Salted",
      image: "/images/flavour-sweet-salt.png",
      cost: 3.1,
      price: 5.5,
      active: true,
      popular: false,
      description: "The best of both worlds — a sweet and salty flavour combo.",
    },
  ];

  // Ingredient inventory based on the pitch's direct-cost purchases.
  const SEED_INVENTORY = [
    { id: "i-kernels", name: "Popcorn Kernels", unit: "g", stock: 1000, min: 500, perBatch: 1000, cost: 35.98 },
    { id: "i-oil", name: "Cooking Oil", unit: "ml", stock: 2000, min: 400, perBatch: 160, cost: 69.99 },
    { id: "i-sugar", name: "White Sugar", unit: "g", stock: 2500, min: 600, perBatch: 400, cost: 56.99 },
    { id: "i-salt", name: "Salt", unit: "g", stock: 500, min: 120, perBatch: 60, cost: 7.99 },
    { id: "i-seasoning", name: "Seasoning", unit: "g", stock: 200, min: 100, perBatch: 80, cost: 25.0 },
    { id: "i-bags", name: "Popcorn Bags", unit: "bags", stock: 100, min: 40, perBatch: 32, cost: 65.0 },
  ];

  // A little history so reports/charts aren't empty on first load.
  function seedSales() {
    const sales = [];
    const today = new Date();
    const sample = [
      { pid: "p-butter", qty: 18 },
      { pid: "p-caramel", qty: 6 },
      { pid: "p-cheese", qty: 5 },
      { pid: "p-sweetsalt", qty: 8 },
    ];
    for (let d = 6; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      sample.forEach((s, idx) => {
        // vary quantities a bit per day
        const qty = Math.max(1, s.qty - (d % 3) + (idx % 2));
        const product = SEED_PRODUCTS.find((p) => p.id === s.pid);
        sales.push({
          id: "s-" + day.getTime() + "-" + idx,
          productId: product.id,
          productName: product.name,
          qty: qty,
          unitPrice: product.price,
          unitCost: product.cost,
          total: +(qty * product.price).toFixed(2),
          profit: +(qty * (product.price - product.cost)).toFixed(2),
          date: day.toISOString(),
        });
      });
    }
    return sales;
  }

  /* ---------- Generic persistence helpers ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.log("[v0] store read error", key, e.message);
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureSeeded() {
    if (!localStorage.getItem(KEYS.seeded)) {
      write(KEYS.products, SEED_PRODUCTS);
      write(KEYS.inventory, SEED_INVENTORY);
      write(KEYS.sales, seedSales());
      localStorage.setItem(KEYS.seeded, "1");
    }
  }

  function uid(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }

  /* ---------- Public API ---------- */
  const Store = {
    KEYS,

    reset() {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
      ensureSeeded();
    },

    /* Products */
    getProducts() {
      ensureSeeded();
      return read(KEYS.products, []);
    },
    getActiveProducts() {
      return this.getProducts().filter((p) => p.active);
    },
    getProduct(id) {
      return this.getProducts().find((p) => p.id === id);
    },
    saveProduct(product) {
      const products = this.getProducts();
      if (product.id) {
        const i = products.findIndex((p) => p.id === product.id);
        if (i > -1) products[i] = { ...products[i], ...product };
      } else {
        product.id = uid("p");
        products.push(product);
      }
      write(KEYS.products, products);
      return product;
    },
    deleteProduct(id) {
      write(KEYS.products, this.getProducts().filter((p) => p.id !== id));
    },

    /* Inventory */
    getInventory() {
      ensureSeeded();
      return read(KEYS.inventory, []);
    },
    getInventoryItem(id) {
      return this.getInventory().find((i) => i.id === id);
    },
    saveInventoryItem(item) {
      const inv = this.getInventory();
      if (item.id && inv.some((i) => i.id === item.id)) {
        const idx = inv.findIndex((i) => i.id === item.id);
        inv[idx] = { ...inv[idx], ...item };
      } else {
        item.id = item.id || uid("i");
        inv.push(item);
      }
      write(KEYS.inventory, inv);
      return item;
    },
    deleteInventoryItem(id) {
      write(KEYS.inventory, this.getInventory().filter((i) => i.id !== id));
    },
    restockItem(id, amount) {
      const inv = this.getInventory();
      const item = inv.find((i) => i.id === id);
      if (item) {
        item.stock += Number(amount) || 0;
        write(KEYS.inventory, inv);
      }
      return item;
    },
    lowStockItems() {
      return this.getInventory().filter((i) => i.stock <= i.min);
    },

    /* Sales */
    getSales() {
      ensureSeeded();
      return read(KEYS.sales, []);
    },
    recordSale(productId, qty) {
      const product = this.getProduct(productId);
      if (!product) return null;
      qty = Number(qty);
      const sale = {
        id: uid("s"),
        productId: product.id,
        productName: product.name,
        qty: qty,
        unitPrice: product.price,
        unitCost: product.cost,
        total: +(qty * product.price).toFixed(2),
        profit: +(qty * (product.price - product.cost)).toFixed(2),
        date: new Date().toISOString(),
      };
      const sales = this.getSales();
      sales.push(sale);
      write(KEYS.sales, sales);

      // Inventory Update Algorithm: deduct one batch worth of ingredients
      // proportional to bags sold (batch = 32 bags per pitch).
      const inv = this.getInventory();
      const batchFraction = qty / 32;
      inv.forEach((i) => {
        i.stock = Math.max(0, +(i.stock - i.perBatch * batchFraction).toFixed(2));
      });
      write(KEYS.inventory, inv);

      return sale;
    },
    deleteSale(id) {
      write(KEYS.sales, this.getSales().filter((s) => s.id !== id));
    },

    /* Reports / analytics */
    summary() {
      const sales = this.getSales();
      const revenue = sales.reduce((a, s) => a + s.total, 0);
      const profit = sales.reduce((a, s) => a + s.profit, 0);
      const bags = sales.reduce((a, s) => a + s.qty, 0);
      return {
        revenue: +revenue.toFixed(2),
        profit: +profit.toFixed(2),
        cost: +(revenue - profit).toFixed(2),
        bags,
        orders: sales.length,
        margin: revenue ? Math.round((profit / revenue) * 100) : 0,
      };
    },
    salesByDay(days) {
      days = days || 7;
      const sales = this.getSales();
      const out = [];
      const today = new Date();
      for (let d = days - 1; d >= 0; d--) {
        const day = new Date(today);
        day.setDate(today.getDate() - d);
        const key = day.toISOString().slice(0, 10);
        const daySales = sales.filter((s) => s.date.slice(0, 10) === key);
        out.push({
          label: day.toLocaleDateString("en-ZA", { weekday: "short" }),
          date: key,
          revenue: +daySales.reduce((a, s) => a + s.total, 0).toFixed(2),
          profit: +daySales.reduce((a, s) => a + s.profit, 0).toFixed(2),
          bags: daySales.reduce((a, s) => a + s.qty, 0),
        });
      }
      return out;
    },
    salesByProduct() {
      const sales = this.getSales();
      const map = {};
      sales.forEach((s) => {
        if (!map[s.productId]) map[s.productId] = { name: s.productName, bags: 0, revenue: 0, profit: 0 };
        map[s.productId].bags += s.qty;
        map[s.productId].revenue += s.total;
        map[s.productId].profit += s.profit;
      });
      return Object.values(map)
        .map((r) => ({ ...r, revenue: +r.revenue.toFixed(2), profit: +r.profit.toFixed(2) }))
        .sort((a, b) => b.bags - a.bags);
    },

    /* Auth (placeholder session, not real security) */
    login(email) {
      const session = { email: email, name: email.split("@")[0], at: Date.now() };
      write(KEYS.session, session);
      return session;
    },
    getSession() {
      return read(KEYS.session, null);
    },
    logout() {
      localStorage.removeItem(KEYS.session);
    },
  };

  window.PGStore = Store;
})();
