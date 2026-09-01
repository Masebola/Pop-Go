/* ============================================================
   Pop & Go — Data Store (Supabase edition)
   Same idea as the old localStorage version, but every method now
   talks to Supabase and returns a Promise. Pages must `await` calls,
   e.g.  const products = await PGStore.getActiveProducts();
   ============================================================ */

(function () {
  "use strict";

  async function client() {
    return window.sbReady;
  }

  function mapProduct(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      flavour: row.flavour,
      description: row.description,
      image: row.image_url,
      cost: Number(row.cost_price),
      price: Number(row.sell_price),
      active: row.active,
      popular: row.popular,
    };
  }

  function mapInventory(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
      min: Number(row.min_level),
      perBatch: Number(row.per_batch),
      cost: Number(row.purchase_cost),
    };
  }

  const Store = {
    /* ---------------- Auth ---------------- */
    async signUp(email, password, fullName) {
      const sb = await client();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || "" } },
      });
      if (error) throw error;
      return data;
    },
    async signIn(email, password) {
      const sb = await client();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const sb = await client();
      await sb.auth.signOut();
    },
    async getSession() {
      const sb = await client();
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async getProfile() {
      const sb = await client();
      const session = await this.getSession();
      if (!session) return null;
      const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
      if (error) return null;
      return data;
    },
    async isAdmin() {
      const profile = await this.getProfile();
      return !!profile && profile.role === "admin";
    },

    /* ---------------- Products ---------------- */
    async getProducts() {
      const sb = await client();
      const { data, error } = await sb.from("products").select("*").order("created_at");
      if (error) { console.error(error); return []; }
      return data.map(mapProduct);
    },
    async getActiveProducts() {
      const sb = await client();
      const { data, error } = await sb.from("products").select("*").eq("active", true).order("created_at");
      if (error) { console.error(error); return []; }
      return data.map(mapProduct);
    },
    async getProduct(id) {
      const sb = await client();
      const { data, error } = await sb.from("products").select("*").eq("id", id).single();
      if (error) return null;
      return mapProduct(data);
    },
    async saveProduct(product) {
      const sb = await client();
      const row = {
        name: product.name,
        flavour: product.flavour,
        description: product.description,
        image_url: product.image,
        cost_price: product.cost,
        sell_price: product.price,
        active: !!product.active,
        popular: !!product.popular,
        updated_at: new Date().toISOString(),
      };
      if (product.id) {
        const { error } = await sb.from("products").update(row).eq("id", product.id);
        if (error) throw error;
        return { ...product };
      }
      const { data, error } = await sb.from("products").insert(row).select().single();
      if (error) throw error;
      return mapProduct(data);
    },
    async deleteProduct(id) {
      const sb = await client();
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) throw error;
    },

    /* ---------------- Inventory ---------------- */
    async getInventory() {
      const sb = await client();
      const { data, error } = await sb.from("inventory_items").select("*").order("name");
      if (error) { console.error(error); return []; }
      return data.map(mapInventory);
    },
    async getInventoryItem(id) {
      const sb = await client();
      const { data, error } = await sb.from("inventory_items").select("*").eq("id", id).single();
      if (error) return null;
      return mapInventory(data);
    },
    async saveInventoryItem(item) {
      const sb = await client();
      const row = {
        name: item.name,
        unit: item.unit,
        stock: item.stock,
        min_level: item.min,
        per_batch: item.perBatch,
        purchase_cost: item.cost,
        updated_at: new Date().toISOString(),
      };
      if (item.id) {
        const { error } = await sb.from("inventory_items").update(row).eq("id", item.id);
        if (error) throw error;
        return item;
      }
      const { data, error } = await sb.from("inventory_items").insert(row).select().single();
      if (error) throw error;
      return mapInventory(data);
    },
    async deleteInventoryItem(id) {
      const sb = await client();
      const { error } = await sb.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    async restockItem(id, amount) {
      const sb = await client();
      const item = await this.getInventoryItem(id);
      if (!item) return null;
      const newStock = item.stock + (Number(amount) || 0);
      const { error } = await sb.from("inventory_items").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return { ...item, stock: newStock };
    },
    async lowStockItems() {
      const inv = await this.getInventory();
      return inv.filter((i) => i.stock <= i.min);
    },

    /* ---------------- Business settings (admin pricing inputs) ---------------- */
    async getSettings() {
      const sb = await client();
      const { data, error } = await sb.from("business_settings").select("*").order("key");
      if (error) { console.error(error); return []; }
      return data;
    },
    async saveSetting(key, value) {
      const sb = await client();
      const { error } = await sb.from("business_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) throw error;
    },

    /* ---------------- Checkout / simulated payment ---------------- */
    // items: [{ id, quantity }]  (product id + qty from the cart)
    async checkout(items, customer) {
      const sb = await client();
      customer = customer || {};
      const session = await this.getSession();
      const payload = {
        p_items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        p_customer_name: customer.name || "Guest",
        p_customer_email: customer.email || null,
        p_customer_id: session ? session.user.id : null,
      };
      const { data, error } = await sb.rpc("record_sale", payload);
      if (error) throw error;
      return data; // { order_id, order_number, total, reference, paid_at }
    },
    // Used by the admin "Record a sale" quick-sell panel — same RPC.
    async recordSale(productId, qty) {
      const result = await this.checkout([{ id: productId, quantity: Number(qty) }], { name: "Walk-in (Admin)" });
      return result;
    },

    /* ---------------- Orders / sales history & reports ---------------- */
    async getOrders() {
      const sb = await client();
      const { data, error } = await sb
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) { console.error(error); return []; }
      return data;
    },
    // Flattened list of every order_item (mirrors the old "sales" rows)
    async getSales() {
      const orders = await this.getOrders();
      const rows = [];
      orders
        .filter((o) => o.status === "paid" || o.status === "fulfilled")
        .forEach((o) => {
          (o.order_items || []).forEach((it) => {
            rows.push({
              id: it.id,
              productId: it.product_id,
              productName: it.product_name,
              qty: it.quantity,
              unitPrice: Number(it.unit_price),
              unitCost: Number(it.unit_cost),
              total: Number(it.line_total),
              profit: +(Number(it.line_total) - Number(it.unit_cost) * it.quantity).toFixed(2),
              date: o.created_at,
              orderId: o.id,
              orderNumber: o.order_number,
            });
          });
        });
      return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    async deleteSale(orderItemId) {
      const sb = await client();
      // Admin-only cleanup: cancel the whole parent order (keeps ledger consistent)
      const { data: item } = await sb.from("order_items").select("order_id").eq("id", orderItemId).single();
      if (item) {
        await sb.from("orders").update({ status: "cancelled" }).eq("id", item.order_id);
      }
    },
    async summary() {
      const sales = await this.getSales();
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
    async salesByDay(days) {
      days = days || 7;
      const sales = await this.getSales();
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
    async salesByProduct() {
      const sales = await this.getSales();
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
  };

  window.PGStore = Store;
})();
