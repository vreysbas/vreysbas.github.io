from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, flash, redirect, render_template, request, url_for

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "shop.db"


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "change-this-secret-key"

    init_db()

    @app.get("/")
    def index() -> str:
        products = list_products()
        return render_template("index.html", products=products)

    @app.route("/checkout", methods=["GET", "POST"])
    def checkout() -> str:
        products = list_products()

        if request.method == "POST":
            full_name = request.form.get("full_name", "").strip()
            email = request.form.get("email", "").strip()
            address = request.form.get("address", "").strip()
            product_id = int(request.form.get("product_id", "0"))
            quantity = int(request.form.get("quantity", "1"))

            if not full_name or not email or not address:
                flash("Please fill in all customer fields.", "error")
                return render_template("checkout.html", products=products)

            if quantity < 1:
                flash("Quantity must be at least 1.", "error")
                return render_template("checkout.html", products=products)

            product = get_product(product_id)
            if not product:
                flash("Selected product does not exist.", "error")
                return render_template("checkout.html", products=products)

            order_id = save_order(
                full_name=full_name,
                email=email,
                address=address,
                product=product,
                quantity=quantity,
            )
            return redirect(url_for("order_success", order_id=order_id))

        selected_product_id = request.args.get("product_id", type=int)
        return render_template(
            "checkout.html",
            products=products,
            selected_product_id=selected_product_id,
        )

    @app.get("/order/<int:order_id>/success")
    def order_success(order_id: int) -> str:
        order = get_order(order_id)
        if not order:
            return redirect(url_for("index"))
        return render_template("order_success.html", order=order)

    @app.get("/admin/customers")
    def admin_customers() -> str:
        customer_orders = list_customer_orders()
        return render_template("admin.html", customer_orders=customer_orders)

    return app


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                address TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                total_amount REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(customer_id) REFERENCES customers(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                line_total REAL NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id),
                FOREIGN KEY(product_id) REFERENCES products(id)
            )
            """
        )

        product_count = conn.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
        if product_count == 0:
            conn.executemany(
                "INSERT INTO products (name, price) VALUES (?, ?)",
                [
                    ("Classic Hoodie", 59.99),
                    ("Sport Sneakers", 89.50),
                    ("Travel Backpack", 74.00),
                    ("Daily Water Bottle", 24.99),
                ],
            )


def list_products() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT id, name, price FROM products ORDER BY id ASC").fetchall()
        return [dict(row) for row in rows]


def get_product(product_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, price FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        return dict(row) if row else None


def save_order(
    full_name: str,
    email: str,
    address: str,
    product: dict[str, Any],
    quantity: int,
) -> int:
    line_total = round(product["price"] * quantity, 2)

    with get_connection() as conn:
        customer_cursor = conn.execute(
            "INSERT INTO customers (full_name, email, address) VALUES (?, ?, ?)",
            (full_name, email, address),
        )
        customer_id = customer_cursor.lastrowid

        order_cursor = conn.execute(
            "INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)",
            (customer_id, line_total),
        )
        order_id = order_cursor.lastrowid

        conn.execute(
            """
            INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?)
            """,
            (order_id, product["id"], quantity, product["price"], line_total),
        )

        return int(order_id)


def get_order(order_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                o.id AS order_id,
                o.total_amount,
                o.created_at,
                c.full_name,
                c.email,
                c.address,
                p.name AS product_name,
                oi.quantity,
                oi.unit_price,
                oi.line_total
            FROM orders o
            JOIN customers c ON c.id = o.customer_id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN products p ON p.id = oi.product_id
            WHERE o.id = ?
            """,
            (order_id,),
        ).fetchone()

        return dict(row) if row else None


def list_customer_orders() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id AS customer_id,
                c.full_name,
                c.email,
                c.address,
                o.id AS order_id,
                o.created_at,
                o.total_amount,
                p.name AS product_name,
                oi.quantity,
                oi.line_total
            FROM customers c
            JOIN orders o ON o.customer_id = c.id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN products p ON p.id = oi.product_id
            ORDER BY o.created_at DESC, c.full_name ASC
            """
        ).fetchall()

        return [dict(row) for row in rows]


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
