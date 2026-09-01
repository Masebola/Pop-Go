/* ============================================================
   Pop & Go — Admin Dashboard logic
   Renders Overview / Products / Inventory / Sales / Reports,
   backed by PGStore (Supabase). No frameworks.
   ============================================================ */

(function () {
  "use strict";

  const S = window.PGStore;
  const money = window.PGUI.money;
  const toast = window.PGUI.toast;
  const hydrate = window.PGUI.hydrateIcons;

  const TITLES = {
    overview: "Overview",
    products: "Products",
    inventory: "Inventory",
    sales: "Sales",
    reports: "Reports",
    pricing: "Pricing calculator",
  };

  /* ---------- small helpers ---------- */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ============================================================
     RENDERERS
     ============================================================ */

  async function renderOverview() {
    el("view-overview").innerHTML = '<div class="empty-state">Loading…</div>';
    const sum = await S.summary();
    const low = await S.lowStockItems();
    const byProduct = await S.salesByProduct();
    const topName = byProduct[0] ? byProduct[0].name : "—";

    let html =
      '<div class="stat-grid">' +
      statCard("money", "Total Revenue", money(sum.revenue), sum.orders + " line items logged") +
      statCard("trending", "Total Profit", money(sum.profit), sum.margin + "% profit margin") +
      statCard("cart", "Bags Sold", sum.bags, "across all flavours") +
      statCard("star", "Top Flavour", topName, byProduct[0] ? byProduct[0].bags + " bags sold" : "no sales yet") +
      "</div>";

    // weekly revenue column chart
    const week = await S.salesByDay(7);
    const maxRev = Math.max.apply(null, week.map((d) => d.revenue).concat([1]));
    html +=
      '<div class="panel"><div class="panel-head"><h3>This week&rsquo;s revenue</h3>' +
      '<span class="badge muted">Last 7 days</span></div><div class="panel-body">' +
      '<div class="col-chart">' +
      week
        .map(function (d) {
          const h = Math.round((d.revenue / maxRev) * 100);
          return (
            '<div class="col-item">' +
            '<div class="col-value">' + money(d.revenue) + "</div>" +
            '<div class="col-bar-wrap"><div class="col-bar" style="height:' + h + '%"></div></div>' +
            '<div class="col-label">' + esc(d.label) + "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div></div></div>";

    // low stock alerts
    html +=
      '<div class="panel"><div class="panel-head"><h3>Low stock alerts</h3>' +
      '<span class="badge ' + (low.length ? "danger" : "ok") + '">' +
      (low.length ? low.length + " need restock" : "All good") + '</span></div><div class="panel-body">';
    if (!low.length) {
      html += '<div class="empty-state">Everything is well stocked. Nice work!</div>';
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Item</th><th>In stock</th><th>Minimum</th><th>Status</th></tr></thead><tbody>';
      low.forEach(function (i) {
        html +=
          "<tr><td>" + esc(i.name) + "</td><td>" + i.stock + " " + esc(i.unit) +
          "</td><td>" + i.min + " " + esc(i.unit) + '</td><td><span class="badge danger">Restock</span></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div></div>";

    el("view-overview").innerHTML = html;
    hydrate(el("view-overview"));
  }

  function statCard(icon, label, value, sub) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-label"><span data-icon="' + icon + '" data-size="16"></span>' + esc(label) + "</div>" +
      '<div class="stat-value">' + esc(value) + "</div>" +
      '<div class="stat-sub">' + esc(sub) + "</div></div>"
    );
  }

  async function renderProducts() {
    el("view-products").innerHTML = '<div class="empty-state">Loading…</div>';
    const products = await S.getProducts();
    let html =
      '<div class="panel"><div class="panel-head"><h3>All products</h3>' +
      '<button class="btn btn-primary btn-sm" id="addProduct"><span data-icon="plus" data-size="16"></span> Add product</button>' +
      "</div><div class=\"panel-body\"><div class=\"table-wrap\"><table class=\"data\"><thead><tr>" +
      "<th>Product</th><th>Flavour</th><th>Cost</th><th>Price</th><th>Margin</th><th>Status</th><th></th>" +
      "</tr></thead><tbody>";

    if (!products.length) {
      html += '<tr><td colspan="7"><div class="empty-state">No products yet. Add your first flavour.</div></td></tr>';
    } else {
      products.forEach(function (p) {
        const margin = p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
        html +=
          "<tr>" +
          '<td><div class="prod-cell"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" />' +
          "<span>" + esc(p.name) + (p.popular ? ' <span class="badge warn">Popular</span>' : "") + "</span></div></td>" +
          "<td>" + esc(p.flavour) + "</td>" +
          "<td>" + money(p.cost) + "</td>" +
          "<td>" + money(p.price) + "</td>" +
          '<td>' + margin + "%</td>" +
          "<td>" + (p.active ? '<span class="badge ok">Active</span>' : '<span class="badge muted">Hidden</span>') + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="icon-btn" data-edit="' + p.id + '" aria-label="Edit"><span data-icon="edit" data-size="16"></span></button>' +
          '<button class="icon-btn danger" data-del="' + p.id + '" aria-label="Delete"><span data-icon="trash" data-size="16"></span></button>' +
          "</div></td></tr>";
      });
    }
    html += "</tbody></table></div></div></div>";
    el("view-products").innerHTML = html;
    hydrate(el("view-products"));

    el("addProduct").addEventListener("click", function () { openProductModal(); });
    el("view-products").querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { openProductModal(b.getAttribute("data-edit")); });
    });
    el("view-products").querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const p = await S.getProduct(b.getAttribute("data-del"));
        if (confirm("Delete " + p.name + "?")) {
          await S.deleteProduct(p.id);
          toast("Product deleted");
          renderProducts();
        }
      });
    });
  }

  async function openProductModal(id) {
    const p = id ? await S.getProduct(id) : { name: "", flavour: "", price: "", cost: "", image: "/images/flavour-butter.png", description: "", active: true, popular: false };
    const images = [
      ["/images/flavour-butter.png", "Butter"],
      ["/images/flavour-caramel.png", "Caramel"],
      ["/images/flavour-cheese.png", "Cheese"],
      ["/images/flavour-sweet-salt.png", "Sweet & Salt"],
    ];
    const body =
      '<form class="admin-form" id="productForm">' +
      '<label>Product name</label><input name="name" required value="' + esc(p.name) + '" placeholder="e.g. Classic Butter" />' +
      '<label>Flavour</label><input name="flavour" value="' + esc(p.flavour) + '" placeholder="e.g. Buttery Salted" />' +
      '<div class="field-row">' +
      '<div><label>Cost per bag (R)</label><input name="cost" type="number" step="0.01" min="0" required value="' + esc(p.cost) + '" /></div>' +
      '<div><label>Price per bag (R)</label><input name="price" type="number" step="0.01" min="0" required value="' + esc(p.price) + '" /></div>' +
      "</div>" +
      '<label>Image</label><select name="image">' +
      images.map(function (im) {
        return '<option value="' + im[0] + '"' + (p.image === im[0] ? " selected" : "") + ">" + im[1] + "</option>";
      }).join("") +
      "</select>" +
      '<label>Description</label><textarea name="description" rows="2" placeholder="Short description">' + esc(p.description) + "</textarea>" +
      '<div class="field-row">' +
      '<label style="display:flex;align-items:center;gap:0.5rem;font-weight:500;"><input type="checkbox" name="active" style="width:auto;margin:0;"' + (p.active ? " checked" : "") + " /> Active (show on site)</label>" +
      '<label style="display:flex;align-items:center;gap:0.5rem;font-weight:500;"><input type="checkbox" name="popular" style="width:auto;margin:0;"' + (p.popular ? " checked" : "") + " /> Mark as popular</label>" +
      "</div>" +
      '<div class="modal-foot" style="padding-left:0;padding-right:0;padding-bottom:0;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cancelModal">Cancel</button>' +
      '<button type="submit" class="btn btn-primary btn-sm">' + (id ? "Save changes" : "Add product") + "</button>" +
      "</div></form>";

    openModal(id ? "Edit product" : "Add product", body);
    el("cancelModal").addEventListener("click", closeModal);
    el("productForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      const f = e.target;
      await S.saveProduct({
        id: id || undefined,
        name: f.name.value.trim(),
        flavour: f.flavour.value.trim(),
        cost: parseFloat(f.cost.value) || 0,
        price: parseFloat(f.price.value) || 0,
        image: f.image.value,
        description: f.description.value.trim(),
        active: f.active.checked,
        popular: f.popular.checked,
      });
      closeModal();
      toast(id ? "Product updated" : "Product added");
      renderProducts();
    });
  }

  async function renderInventory() {
    el("view-inventory").innerHTML = '<div class="empty-state">Loading…</div>';
    const inv = await S.getInventory();
    let html =
      '<div class="panel"><div class="panel-head"><h3>Ingredients &amp; supplies</h3>' +
      '<button class="btn btn-primary btn-sm" id="addItem"><span data-icon="plus" data-size="16"></span> Add item</button>' +
      "</div><div class=\"panel-body\"><div class=\"table-wrap\"><table class=\"data\"><thead><tr>" +
      "<th>Item</th><th>In stock</th><th>Min level</th><th>Used / batch</th><th>Status</th><th></th>" +
      "</tr></thead><tbody>";

    inv.forEach(function (i) {
      const status = i.stock <= i.min
        ? '<span class="badge danger">Low</span>'
        : i.stock <= i.min * 1.5
        ? '<span class="badge warn">Watch</span>'
        : '<span class="badge ok">OK</span>';
      html +=
        "<tr><td>" + esc(i.name) + "</td>" +
        "<td>" + i.stock + " " + esc(i.unit) + "</td>" +
        "<td>" + i.min + " " + esc(i.unit) + "</td>" +
        "<td>" + i.perBatch + " " + esc(i.unit) + "</td>" +
        "<td>" + status + "</td>" +
        '<td><div class="row-actions">' +
        '<button class="icon-btn" data-restock="' + i.id + '" aria-label="Restock"><span data-icon="plus" data-size="16"></span></button>' +
        '<button class="icon-btn" data-edititem="' + i.id + '" aria-label="Edit"><span data-icon="edit" data-size="16"></span></button>' +
        '<button class="icon-btn danger" data-delitem="' + i.id + '" aria-label="Delete"><span data-icon="trash" data-size="16"></span></button>' +
        "</div></td></tr>";
    });
    html += "</tbody></table></div></div></div>";
    el("view-inventory").innerHTML = html;
    hydrate(el("view-inventory"));

    el("addItem").addEventListener("click", function () { openItemModal(); });
    el("view-inventory").querySelectorAll("[data-restock]").forEach(function (b) {
      b.addEventListener("click", function () { openRestockModal(b.getAttribute("data-restock")); });
    });
    el("view-inventory").querySelectorAll("[data-edititem]").forEach(function (b) {
      b.addEventListener("click", function () { openItemModal(b.getAttribute("data-edititem")); });
    });
    el("view-inventory").querySelectorAll("[data-delitem]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const it = await S.getInventoryItem(b.getAttribute("data-delitem"));
        if (confirm("Delete " + it.name + "?")) {
          await S.deleteInventoryItem(it.id);
          toast("Item deleted");
          renderInventory();
        }
      });
    });
  }

  async function openItemModal(id) {
    const it = id ? await S.getInventoryItem(id) : { name: "", unit: "g", stock: "", min: "", perBatch: "", cost: "" };
    const body =
      '<form class="admin-form" id="itemForm">' +
      '<label>Item name</label><input name="name" required value="' + esc(it.name) + '" placeholder="e.g. Popcorn Kernels" />' +
      '<div class="field-row">' +
      '<div><label>Unit</label><input name="unit" value="' + esc(it.unit) + '" placeholder="g, ml, bags" /></div>' +
      '<div><label>Current stock</label><input name="stock" type="number" step="0.01" min="0" required value="' + esc(it.stock) + '" /></div>' +
      "</div>" +
      '<div class="field-row">' +
      '<div><label>Minimum level</label><input name="min" type="number" step="0.01" min="0" required value="' + esc(it.min) + '" /></div>' +
      '<div><label>Used per batch</label><input name="perBatch" type="number" step="0.01" min="0" value="' + esc(it.perBatch) + '" /></div>' +
      "</div>" +
      '<label>Purchase cost (R)</label><input name="cost" type="number" step="0.01" min="0" value="' + esc(it.cost) + '" />' +
      '<div class="modal-foot" style="padding:0;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cancelModal">Cancel</button>' +
      '<button type="submit" class="btn btn-primary btn-sm">' + (id ? "Save changes" : "Add item") + "</button>" +
      "</div></form>";
    openModal(id ? "Edit item" : "Add inventory item", body);
    el("cancelModal").addEventListener("click", closeModal);
    el("itemForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      const f = e.target;
      await S.saveInventoryItem({
        id: id || undefined,
        name: f.name.value.trim(),
        unit: f.unit.value.trim() || "unit",
        stock: parseFloat(f.stock.value) || 0,
        min: parseFloat(f.min.value) || 0,
        perBatch: parseFloat(f.perBatch.value) || 0,
        cost: parseFloat(f.cost.value) || 0,
      });
      closeModal();
      toast(id ? "Item updated" : "Item added");
      renderInventory();
    });
  }

  async function openRestockModal(id) {
    const it = await S.getInventoryItem(id);
    const body =
      '<form class="admin-form" id="restockForm">' +
      "<p style=\"margin-bottom:1rem;color:var(--muted);\">Current stock: <strong>" + it.stock + " " + esc(it.unit) + "</strong></p>" +
      '<label>Add quantity (' + esc(it.unit) + ")</label>" +
      '<input name="amount" type="number" step="0.01" min="0" required autofocus placeholder="e.g. 500" />' +
      '<div class="modal-foot" style="padding:0;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cancelModal">Cancel</button>' +
      '<button type="submit" class="btn btn-primary btn-sm">Restock</button>' +
      "</div></form>";
    openModal("Restock " + it.name, body);
    el("cancelModal").addEventListener("click", closeModal);
    el("restockForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      await S.restockItem(id, e.target.amount.value);
      closeModal();
      toast(it.name + " restocked");
      renderInventory();
    });
  }

  async function renderSales() {
    el("view-sales").innerHTML = '<div class="empty-state">Loading…</div>';
    const products = await S.getActiveProducts();
    const sales = (await S.getSales()).slice().reverse();

    let html =
      '<div class="panel"><div class="panel-head"><h3>Record a walk-in sale</h3>' +
      '<span class="badge muted">Selling reduces stock automatically</span></div>' +
      '<div class="panel-body"><div class="sell-grid">';
    products.forEach(function (p) {
      html +=
        '<div class="sell-card">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" />' +
        '<div class="name">' + esc(p.name) + "</div>" +
        '<div class="price">' + money(p.price) + "</div>" +
        '<div class="qty-row"><input type="number" min="1" value="1" id="qty-' + p.id + '" aria-label="Quantity for ' + esc(p.name) + '" /></div>' +
        '<button class="btn btn-primary btn-sm" style="width:100%;" data-sell="' + p.id + '">Sell</button>' +
        "</div>";
    });
    html += "</div></div></div>";

    // recent sales table
    html +=
      '<div class="panel"><div class="panel-head"><h3>Recent sales</h3>' +
      '<span class="badge muted">' + sales.length + " total</span></div>" +
      '<div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr>' +
      "<th>Date</th><th>Product</th><th>Qty</th><th>Total</th><th>Profit</th><th></th>" +
      "</tr></thead><tbody>";
    if (!sales.length) {
      html += '<tr><td colspan="6"><div class="empty-state">No sales recorded yet.</div></td></tr>';
    } else {
      sales.slice(0, 40).forEach(function (s) {
        const d = new Date(s.date);
        html +=
          "<tr><td>" + d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }) +
          " " + d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) + "</td>" +
          "<td>" + esc(s.productName) + "</td>" +
          "<td>" + s.qty + "</td>" +
          "<td>" + money(s.total) + "</td>" +
          '<td><span class="badge ok">' + money(s.profit) + "</span></td>" +
          '<td><button class="icon-btn danger" data-delsale="' + s.id + '" aria-label="Cancel order"><span data-icon="trash" data-size="16"></span></button></td></tr>';
      });
    }
    html += "</tbody></table></div></div></div>";
    el("view-sales").innerHTML = html;
    hydrate(el("view-sales"));

    el("view-sales").querySelectorAll("[data-sell]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const pid = b.getAttribute("data-sell");
        const qty = parseInt(el("qty-" + pid).value, 10);
        if (!qty || qty < 1) { toast("Enter a valid quantity"); return; }
        b.disabled = true;
        try {
          await S.recordSale(pid, qty);
          toast(qty + " bag(s) sold");
          renderSales();
        } catch (ex) {
          toast("Could not record sale: " + (ex.message || ex));
          b.disabled = false;
        }
      });
    });
    el("view-sales").querySelectorAll("[data-delsale]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("Cancel this order?")) return;
        await S.deleteSale(b.getAttribute("data-delsale"));
        toast("Order cancelled");
        renderSales();
      });
    });
  }

  async function renderReports() {
    el("view-reports").innerHTML = '<div class="empty-state">Loading…</div>';
    const sum = await S.summary();
    const byProduct = await S.salesByProduct();
    const week = await S.salesByDay(7);
    const maxBags = Math.max.apply(null, byProduct.map((r) => r.bags).concat([1]));

    let html =
      '<div class="stat-grid">' +
      statCard("money", "Revenue", money(sum.revenue), "gross sales") +
      statCard("tag", "Cost of goods", money(sum.cost), "ingredients + supplies") +
      statCard("trending", "Net profit", money(sum.profit), sum.margin + "% margin") +
      statCard("cart", "Avg / line item", money(sum.orders ? sum.revenue / sum.orders : 0), sum.orders + " line items") +
      "</div>";

    // sales by product
    html +=
      '<div class="panel"><div class="panel-head"><h3>Bags sold by flavour</h3></div><div class="panel-body">';
    if (!byProduct.length) {
      html += '<div class="empty-state">No sales data yet.</div>';
    } else {
      html += '<div class="bar-chart">';
      byProduct.forEach(function (r) {
        const w = Math.round((r.bags / maxBags) * 100);
        html +=
          '<div class="bar-row"><div class="bar-label">' + esc(r.name) + "</div>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
          '<div class="bar-value">' + r.bags + " bags</div></div>";
      });
      html += "</div>";
    }
    html += "</div></div>";

    // revenue vs profit by product table
    html +=
      '<div class="panel"><div class="panel-head"><h3>Profit breakdown by flavour</h3></div>' +
      '<div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr>' +
      "<th>Flavour</th><th>Bags</th><th>Revenue</th><th>Profit</th><th>Margin</th>" +
      "</tr></thead><tbody>";
    byProduct.forEach(function (r) {
      const margin = r.revenue ? Math.round((r.profit / r.revenue) * 100) : 0;
      html +=
        "<tr><td>" + esc(r.name) + "</td><td>" + r.bags + "</td><td>" + money(r.revenue) +
        "</td><td>" + money(r.profit) + "</td><td>" + margin + "%</td></tr>";
    });
    html += "</tbody></table></div></div></div>";

    // daily profit
    const maxProfit = Math.max.apply(null, week.map((d) => d.profit).concat([1]));
    html +=
      '<div class="panel"><div class="panel-head"><h3>Daily profit — last 7 days</h3></div><div class="panel-body">' +
      '<div class="bar-chart">';
    week.forEach(function (d) {
      const w = Math.round((d.profit / maxProfit) * 100);
      html +=
        '<div class="bar-row"><div class="bar-label">' + esc(d.label) + "</div>" +
        '<div class="bar-track"><div class="bar-fill gold" style="width:' + w + '%"></div></div>' +
        '<div class="bar-value">' + money(d.profit) + "</div></div>";
    });
    html += "</div></div></div>";

    el("view-reports").innerHTML = html;
    hydrate(el("view-reports"));
  }

  /* ---------- Pricing calculator (cost-plus, matches the Final Report §6 model) ---------- */
  async function renderPricing() {
    el("view-pricing").innerHTML = '<div class="empty-state">Loading…</div>';
    const settings = await S.getSettings();
    const map = {};
    settings.forEach((s) => { map[s.key] = s; });

    function num(key, fallback) { return map[key] ? Number(map[key].value) : fallback; }

    const bagsPerBatch = num("bags_per_batch", 32);
    const batchesPerDay = num("batches_per_trading_day", 1);
    const tradingDays = num("trading_days_per_month", 22);
    const electricityMonth = num("electricity_cost_month", 150);
    const dataMonth = num("mobile_data_cost_month", 50);
    const transportMonth = num("transport_cost_month", 30);
    const glovesMonth = num("gloves_cost_month", 80);
    const startupEquipment = num("startup_equipment_cost_once", 2494.95);

    const bagsPerMonth = bagsPerBatch * batchesPerDay * tradingDays;
    // Flat monthly overheads only — the popcorn machine itself is a
    // one-time startup cost (shown separately below), not a recurring
    // per-batch charge. This matches the Final Report, Section 6.
    const monthlyIndirect = electricityMonth + dataMonth + transportMonth + glovesMonth;
    const indirectPerBag = bagsPerMonth ? monthlyIndirect / bagsPerMonth : 0;

    let html =
      '<div class="panel"><div class="panel-head"><h3>Cost-plus pricing model</h3>' +
      '<span class="badge muted">Editable — updates live pricing guidance</span></div>' +
      '<div class="panel-body">' +
      '<p style="color:var(--muted);margin-bottom:1rem;">Matches the Final Report, Section 6: the popcorn machine is a one-time startup purchase (shown separately below, not spread across bags), and monthly overheads (electricity, data, transport, gloves) are divided across the bags made that month. Each batch makes ' + bagsPerBatch + ' bags.</p>' +
      '<form class="admin-form" id="settingsForm"><div class="field-row">';
    settings.filter((s) => s.key !== "startup_equipment_cost_once").forEach((s) => {
      html += '<div><label>' + esc(s.label) + ' (' + esc(s.unit) + ')</label><input data-key="' + s.key + '" type="number" step="0.01" value="' + s.value + '" /></div>';
    });
    html += '</div><button type="submit" class="btn btn-primary btn-sm">Save cost settings</button></form></div></div>';

    html +=
      '<div class="stat-grid">' +
      statCard("box", "Bags per batch", bagsPerBatch, batchesPerDay + " batch(es)/day") +
      statCard("cart", "Bags per month", bagsPerMonth, tradingDays + " trading days") +
      statCard("money", "Indirect cost / bag", "R" + indirectPerBag.toFixed(2), "monthly overheads ÷ bags per month") +
      statCard("tag", "Monthly overheads", "R" + monthlyIndirect.toFixed(2), "electricity, data, transport, gloves") +
      "</div>";

    html +=
      '<div class="panel"><div class="panel-head"><h3>Startup equipment</h3>' +
      '<span class="badge muted">One-time — not part of per-bag cost</span></div>' +
      '<div class="panel-body">' +
      '<p style="color:var(--muted);">The popcorn machine, utensils, and other one-time equipment ' +
      '(<strong>R' + startupEquipment.toFixed(2) + '</strong> total, per the Final Report §6.1) is a startup ' +
      'cost the business recovers over time through overall profit — it deliberately is <em>not</em> divided into the per-bag cost above, since it is not a recurring expense.</p>' +
      '<div class="admin-form" style="max-width:280px;margin-top:0.75rem;"><label>Startup equipment cost (R, one-time)</label>' +
      '<input data-key="startup_equipment_cost_once" form="settingsForm" type="number" step="0.01" value="' + startupEquipment + '" /></div>' +
      '</div></div>';

    // per-product suggested pricing using current ingredient cost (from products table cost_price) + indirect
    const products = await S.getProducts();
    html +=
      '<div class="panel"><div class="panel-head"><h3>Suggested price per flavour</h3></div>' +
      '<div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Flavour</th><th>Ingredient cost</th><th>+ Indirect / bag</th><th>Total cost</th><th>Current price</th><th>Margin</th>' +
      '</tr></thead><tbody>';
    products.forEach((p) => {
      const totalCost = p.cost + indirectPerBag;
      const margin = p.price ? Math.round(((p.price - totalCost) / p.price) * 100) : 0;
      html +=
        '<tr><td>' + esc(p.name) + '</td><td>' + money(p.cost) + '</td><td>' + money(indirectPerBag) +
        '</td><td>' + money(totalCost) + '</td><td>' + money(p.price) + '</td><td>' + margin + '%</td></tr>';
    });
    html += '</tbody></table></div><p style="font-size:0.8rem;color:var(--muted);margin-top:0.75rem;">"Ingredient cost" comes from each product\'s cost field on the Products tab. Update it there if your recipe changes.</p></div></div>';

    el("view-pricing").innerHTML = html;
    hydrate(el("view-pricing"));

    el("settingsForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      // Query the whole tab, not just the <form>, since the startup-equipment
      // field lives outside the form and is linked via form="settingsForm".
      const inputs = el("view-pricing").querySelectorAll("[data-key]");
      for (const inp of inputs) {
        await S.saveSetting(inp.getAttribute("data-key"), parseFloat(inp.value) || 0);
      }
      toast("Cost settings saved");
      renderPricing();
    });
  }

  /* ============================================================
     MODAL
     ============================================================ */
  function openModal(title, bodyHTML) {
    el("modalTitle").textContent = title;
    el("modalBody").innerHTML = bodyHTML;
    el("modal").classList.add("open");
    hydrate(el("modal"));
  }
  function closeModal() { el("modal").classList.remove("open"); }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  const RENDERERS = {
    overview: renderOverview,
    products: renderProducts,
    inventory: renderInventory,
    sales: renderSales,
    reports: renderReports,
    pricing: renderPricing,
  };

  function show(view) {
    document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
    el("view-" + view).classList.add("active");
    document.querySelectorAll("#adminNav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    el("pageTitle").textContent = TITLES[view];
    Promise.resolve(RENDERERS[view]()).catch(function (err) {
      console.error("[Pop & Go] Failed to load " + view + ":", err);
      PGUI.showError(
        el("view-" + view),
        (err && err.message) || "Could not load this data from Supabase.",
        function () { show(view); }
      );
    });
    // close mobile sidebar
    el("sidebar").classList.remove("open");
    el("backdrop").classList.remove("open");
    location.hash = view;
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", async function () {
    try {
      // Auth gate — must be a logged-in admin to see this page.
      const session = await S.getSession();
      if (!session) {
        location.href = "login.html";
        return;
      }
      const isAdmin = await S.isAdmin();
      if (!isAdmin) {
        document.body.innerHTML =
          '<div style="max-width:480px;margin:4rem auto;text-align:center;padding:0 1.5rem;">' +
          '<h1 style="font-family:var(--font-display);margin-bottom:1rem;">Admins only</h1>' +
          '<p style="color:var(--muted);margin-bottom:1.5rem;">This account isn\'t marked as an admin yet. Ask an existing admin to run the promotion SQL in INSTRUCTIONS.md, then log in again.</p>' +
          '<a class="btn btn-primary" href="index.html">Back to site</a></div>';
        return;
      }

      const profile = await S.getProfile();
      const name = (profile && (profile.full_name || profile.email)) || "Owner";
      el("topUser").textContent = name;
      el("sideUser").textContent = name;

      document.querySelectorAll("#adminNav button").forEach(function (b) {
        b.addEventListener("click", function () { show(b.getAttribute("data-view")); });
      });

      el("sidebarToggle").addEventListener("click", function () {
        el("sidebar").classList.toggle("open");
        el("backdrop").classList.toggle("open");
      });
      el("backdrop").addEventListener("click", function () {
        el("sidebar").classList.remove("open");
        el("backdrop").classList.remove("open");
      });

      el("modalClose").addEventListener("click", closeModal);
      el("modal").addEventListener("click", function (e) {
        if (e.target === el("modal")) closeModal();
      });

      el("logoutBtn").addEventListener("click", async function (e) {
        e.preventDefault();
        await S.signOut();
        location.href = "login.html";
      });

      function current() {
        const h = (location.hash || "#overview").replace("#", "");
        return RENDERERS[h] ? h : "overview";
      }
      show(current());
    } catch (err) {
      console.error("[Pop & Go] Admin dashboard failed to start:", err);
      document.body.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText = "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;";
      wrap.appendChild(PGUI.errorBanner(
        err.message || "Could not connect to Supabase.",
        function () { location.reload(); }
      ));
      document.body.appendChild(wrap);
    }
  });
})();
