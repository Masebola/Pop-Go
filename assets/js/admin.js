/* ============================================================
   Pop & Go — Admin Dashboard logic
   Renders Overview / Products / Inventory / Sales / Reports,
   backed by PGStore (localStorage). No frameworks.
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

  function renderOverview() {
    const sum = S.summary();
    const low = S.lowStockItems();
    const byProduct = S.salesByProduct();
    const topName = byProduct[0] ? byProduct[0].name : "—";

    let html =
      '<div class="stat-grid">' +
      statCard("money", "Total Revenue", money(sum.revenue), sum.orders + " orders logged") +
      statCard("trending", "Total Profit", money(sum.profit), sum.margin + "% profit margin") +
      statCard("cart", "Bags Sold", sum.bags, "across all flavours") +
      statCard("star", "Top Flavour", topName, byProduct[0] ? byProduct[0].bags + " bags sold" : "no sales yet") +
      "</div>";

    // weekly revenue column chart
    const week = S.salesByDay(7);
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
      (low.length ? low.length + " need restock" : "All good") + "</span></div><div class="panel-body">";
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
  }

  function statCard(icon, label, value, sub) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-label"><span data-icon="' + icon + '" data-size="16"></span>' + esc(label) + "</div>" +
      '<div class="stat-value">' + esc(value) + "</div>" +
      '<div class="stat-sub">' + esc(sub) + "</div></div>"
    );
  }

  function renderProducts() {
    const products = S.getProducts();
    let html =
      '<div class="panel"><div class="panel-head"><h3>All products</h3>' +
      '<button class="btn btn-primary btn-sm" id="addProduct"><span data-icon="plus" data-size="16"></span> Add product</button>' +
      "</div><div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr>" +
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

    el("addProduct").addEventListener("click", function () { openProductModal(); });
    el("view-products").querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { openProductModal(b.getAttribute("data-edit")); });
    });
    el("view-products").querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        const p = S.getProduct(b.getAttribute("data-del"));
        if (confirm("Delete " + p.name + "?")) {
          S.deleteProduct(p.id);
          toast("Product deleted");
          renderProducts();
          hydrate(el("view-products"));
        }
      });
    });
  }

  function openProductModal(id) {
    const p = id ? S.getProduct(id) : { name: "", flavour: "", price: "", cost: "", image: "/images/flavour-butter.png", description: "", active: true, popular: false };
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
    el("productForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const f = e.target;
      S.saveProduct({
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
      hydrate(el("view-products"));
    });
  }

  function renderInventory() {
    const inv = S.getInventory();
    let html =
      '<div class="panel"><div class="panel-head"><h3>Ingredients &amp; supplies</h3>' +
      '<button class="btn btn-primary btn-sm" id="addItem"><span data-icon="plus" data-size="16"></span> Add item</button>' +
      "</div><div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr>" +
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

    el("addItem").addEventListener("click", function () { openItemModal(); });
    el("view-inventory").querySelectorAll("[data-restock]").forEach(function (b) {
      b.addEventListener("click", function () { openRestockModal(b.getAttribute("data-restock")); });
    });
    el("view-inventory").querySelectorAll("[data-edititem]").forEach(function (b) {
      b.addEventListener("click", function () { openItemModal(b.getAttribute("data-edititem")); });
    });
    el("view-inventory").querySelectorAll("[data-delitem]").forEach(function (b) {
      b.addEventListener("click", function () {
        const it = S.getInventoryItem(b.getAttribute("data-delitem"));
        if (confirm("Delete " + it.name + "?")) {
          S.deleteInventoryItem(it.id);
          toast("Item deleted");
          renderInventory();
          hydrate(el("view-inventory"));
        }
      });
    });
  }

  function openItemModal(id) {
    const it = id ? S.getInventoryItem(id) : { name: "", unit: "g", stock: "", min: "", perBatch: "", cost: "" };
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
    el("itemForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const f = e.target;
      S.saveInventoryItem({
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
      hydrate(el("view-inventory"));
    });
  }

  function openRestockModal(id) {
    const it = S.getInventoryItem(id);
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
    el("restockForm").addEventListener("submit", function (e) {
      e.preventDefault();
      S.restockItem(id, e.target.amount.value);
      closeModal();
      toast(it.name + " restocked");
      renderInventory();
      hydrate(el("view-inventory"));
    });
  }

  function renderSales() {
    const products = S.getActiveProducts();
    const sales = S.getSales().slice().reverse();

    let html =
      '<div class="panel"><div class="panel-head"><h3>Record a sale</h3>' +
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
          '<td><button class="icon-btn danger" data-delsale="' + s.id + '" aria-label="Delete"><span data-icon="trash" data-size="16"></span></button></td></tr>';
      });
    }
    html += "</tbody></table></div></div></div>";
    el("view-sales").innerHTML = html;

    el("view-sales").querySelectorAll("[data-sell]").forEach(function (b) {
      b.addEventListener("click", function () {
        const pid = b.getAttribute("data-sell");
        const qty = parseInt(el("qty-" + pid).value, 10);
        if (!qty || qty < 1) { toast("Enter a valid quantity"); return; }
        S.recordSale(pid, qty);
        toast(qty + " bag(s) sold");
        renderSales();
        hydrate(el("view-sales"));
      });
    });
    el("view-sales").querySelectorAll("[data-delsale]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.deleteSale(b.getAttribute("data-delsale"));
        toast("Sale removed");
        renderSales();
        hydrate(el("view-sales"));
      });
    });
  }

  function renderReports() {
    const sum = S.summary();
    const byProduct = S.salesByProduct();
    const week = S.salesByDay(7);
    const maxBags = Math.max.apply(null, byProduct.map((r) => r.bags).concat([1]));

    let html =
      '<div class="stat-grid">' +
      statCard("money", "Revenue", money(sum.revenue), "gross sales") +
      statCard("tag", "Cost of goods", money(sum.cost), "ingredients + supplies") +
      statCard("trending", "Net profit", money(sum.profit), sum.margin + "% margin") +
      statCard("cart", "Avg / order", money(sum.orders ? sum.revenue / sum.orders : 0), sum.orders + " orders") +
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
  };

  function show(view) {
    document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
    el("view-" + view).classList.add("active");
    document.querySelectorAll("#adminNav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    el("pageTitle").textContent = TITLES[view];
    RENDERERS[view]();
    hydrate(el("view-" + view));
    // close mobile sidebar
    el("sidebar").classList.remove("open");
    el("backdrop").classList.remove("open");
    location.hash = view;
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    // session (soft gate — redirect to login if none)
    const session = S.getSession();
    if (session) {
      const name = session.name || "Owner";
      el("topUser").textContent = name;
      el("sideUser").textContent = name;
    }

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

    el("logoutBtn").addEventListener("click", function () { S.logout(); });

    el("resetData").addEventListener("click", function (e) {
      e.preventDefault();
      if (confirm("Reset all demo data to the original seeded figures?")) {
        S.reset();
        toast("Demo data reset");
        show(current());
      }
    });

    function current() {
      const h = (location.hash || "#overview").replace("#", "");
      return RENDERERS[h] ? h : "overview";
    }
    show(current());
  });
})();
