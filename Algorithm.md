# Algorithm Analysis — Pop & Go

This document analyses the main algorithms used by the Pop & Go website, in the
same simple style used in class (worked examples, basic operation, best /
average / worst case, Big‑O / Big‑Theta / Big‑Omega). The goal here is to show
*understanding* of algorithm analysis, not to produce research-level maths.

For each algorithm we describe:
- What it does
- How it works (basic steps)
- The **basic operation** (the operation that gets executed the most)
- Best, average and worst case
- Big‑O, Big‑Theta (Θ) and Big‑Omega (Ω)

---

## 1. Product Filtering (Products page)

**What it does:** When a customer taps a flavour filter button (e.g. "Sweet
Caramel"), the site needs to pick out only the products that match that
flavour from the full product list.

**How it works (`products.html`):**
```
for each product p in the product list
    if p.flavour equals the chosen filter
        add p to the result list
return the result list
```

**Basic operation:** the comparison `p.flavour === filter`.

**Input size (n):** the number of products, `n`.

**Analysis:** the loop visits every product exactly once and does exactly one
comparison per product, regardless of how many products match. There's no
early exit, so there's nothing to distinguish between "lucky" and "unlucky"
inputs.

- Best case: C(n) = n
- Average case: C(n) = n
- Worst case: C(n) = n

Because best, average and worst case are all the same simple sum
`C(n) = Σ 1` for `i = 0` to `n − 1`, this is a **linear search / linear
filter**.

**Complexity:** Θ(n), which also means O(n) and Ω(n) — it's tight on both
sides because the algorithm never stops early.

---

## 2. Calculating an Order Total (Checkout / `record_sale`)

**What it does:** When a customer checks out, the system must add up the
price of every line in the cart to get the order total (this happens both in
the cart preview in JavaScript, and again inside the `record_sale()` SQL
function on the server as the source of truth).

**How it works:**
```
subtotal ← 0
for each item in the cart
    lineTotal ← item.price × item.quantity
    subtotal ← subtotal + lineTotal
return subtotal
```

**Basic operation:** the multiplication + addition done once per cart line.

**Input size (n):** the number of *distinct* items in the cart (not the
quantity of popcorn bags — a customer buying 10 bags of one flavour is still
just 1 "line").

**Analysis:** exactly one pass over the cart, one basic operation per line,
no branching that could skip or repeat work.

- Best case: C(n) = n
- Average case: C(n) = n
- Worst case: C(n) = n

**Complexity:** Θ(n). In practice `n` is tiny (a student's cart rarely has
more than 4 different flavours), so this step is effectively instant, but the
formal complexity is still linear in the number of cart lines.

---

## 3. Generating a Sales Report — Grouping Sales by Product (`salesByProduct`)

**What it does:** The admin Reports tab needs to turn a long, flat list of
individual sale line-items into a short summary: total bags, revenue and
profit *per flavour*.

**How it works (`assets/js/store.js → salesByProduct`):**
```
map ← empty dictionary            // key = productId
for each sale s in the sales list
    if map does not contain s.productId
        map[s.productId] ← { name, bags: 0, revenue: 0, profit: 0 }
    map[s.productId].bags    ← map[s.productId].bags + s.qty
    map[s.productId].revenue ← map[s.productId].revenue + s.total
    map[s.productId].profit  ← map[s.productId].profit + s.profit
return the values of map, sorted by bags sold (descending)
```

**Basic operation:** the dictionary lookup/insert done once per sale
(`map[s.productId]`).

**Input size (n):** the number of individual sale line-items ever recorded.

**Analysis:** this uses a **hash map** (a plain JavaScript object), where
looking a key up or inserting it takes constant time *on average* — this is
the classic trade-off of hashing: we spend a little memory to avoid having to
re-scan the whole list for every sale.

- Best / average case: each lookup is O(1), and we do it once per sale, so
  the whole pass is Θ(n).
- Worst case: if (hypothetically) every key produced a hash collision, a
  single lookup could degrade to O(n), making the whole function O(n²). This
  essentially never happens in practice with JavaScript's built-in object
  hashing and a handful of flavours, so we don't design around it.

After grouping, the results are **sorted** by `bags` (see Algorithm 4 below)
which adds its own cost on top of the grouping pass.

**Complexity:** Θ(n) on average for the grouping step (plus the cost of the
sort described below).

---

## 4. Sorting the Report Table (sorting by bags sold)

**What it does:** After grouping sales by flavour (Algorithm 3), the results
are sorted so the best-selling flavour appears first in the admin Reports
table.

**How it works:** the code calls JavaScript's built-in `Array.prototype.sort`,
which (in modern engines) is an implementation of **Timsort** — a hybrid of
**merge sort** and **insertion sort**. For a class-friendly explanation we
compare it to the two sorting algorithms covered in the course notes,
Selection Sort and Bubble Sort:

```
ALGORITHM SelectionSort(A[0..n-1])
  for i ← 0 to n-2 do
      min ← i
      for j ← i+1 to n-1 do
          if A[j] > A[min]   // ">" because we want descending order (most bags first)
              min ← j
      swap A[i] and A[min]
```

**Basic operation:** the comparison `A[j] > A[min]`.

**Input size (n):** the number of distinct flavours (small — currently 4,
but the algorithm is analysed for general `n`).

**Analysis (Selection Sort, as taught in class):** the inner loop always
runs to completion no matter what the data looks like, so there's nothing to
distinguish best, average, and worst case:

```
C(n) = Σ(i=0 to n-2) Σ(j=i+1 to n-1) 1
     = Σ(i=0 to n-2) (n − 1 − i)
     = (n − 1)n / 2
```

- Best case: Θ(n²)
- Average case: Θ(n²)
- Worst case: Θ(n²)

**Complexity:** Θ(n²) for Selection/Bubble Sort. Because Pop & Go only ever
sorts a handful of flavours, this is fine in practice — but if the product
catalogue grew into the thousands, a Θ(n log n) algorithm like Merge Sort
would be worth switching to (which is exactly what JavaScript's real
`Array.sort` already uses internally).

---

## 5. Low-Stock Check (`lowStockItems`)

**What it does:** On the admin Overview page, the system needs to find every
ingredient whose current stock has fallen at or below its minimum safe level,
so the team knows what to restock.

**How it works:**
```
result ← empty list
for each item i in the inventory list
    if i.stock ≤ i.min
        add i to result
return result
```

**Basic operation:** the comparison `i.stock ≤ i.min`.

**Input size (n):** the number of distinct inventory items (kernels, oil,
sugar, salt, seasoning, bags — currently 6).

**Analysis:** identical shape to Algorithm 1 (Product Filtering) — a single
pass, one comparison per element, no early exit possible because we must
check every item to build the full low-stock list.

- Best case: C(n) = n
- Average case: C(n) = n
- Worst case: C(n) = n

**Complexity:** Θ(n) — again tight on both sides (so also O(n) and Ω(n)).

---

## Summary Table

| # | Algorithm                          | Basic operation           | Input size (n)          | Best  | Average | Worst | Big‑O    |
|---|-------------------------------------|----------------------------|--------------------------|-------|---------|-------|----------|
| 1 | Product filtering                   | flavour comparison         | # products               | Θ(n)  | Θ(n)    | Θ(n)  | O(n)     |
| 2 | Order total calculation             | multiply + add per line    | # cart lines              | Θ(n)  | Θ(n)    | Θ(n)  | O(n)     |
| 3 | Grouping sales by product           | hash map lookup/insert     | # sale line-items         | Θ(n)  | Θ(n)    | O(n²)*| O(n) avg |
| 4 | Sorting the report table            | element comparison         | # flavours                | Θ(n²) | Θ(n²)   | Θ(n²) | O(n²)    |
| 5 | Low-stock check                     | stock ≤ minimum comparison | # inventory items         | Θ(n)  | Θ(n)    | Θ(n)  | O(n)     |

\* Worst case for hash-map lookups only occurs under pathological hash
collisions, which is not a realistic concern for this project.

---

## Why this matters for Pop & Go

All of the "per n" numbers above are small in this project (a handful of
flavours, a handful of inventory items, and — even after months of trading —
at most a few thousand sale records). That means every algorithm here runs
in a fraction of a second in a browser or in Postgres. The analysis is still
useful, though: it shows *why* we chose simple, easy-to-read loops instead of
more complicated code, and it shows where the design would need to change
(e.g. Algorithm 4) if Pop & Go grew from a small campus stall into a much
bigger catalogue.
