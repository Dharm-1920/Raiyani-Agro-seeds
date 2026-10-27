"""Internal invoice service. Run: uvicorn main:app --port 8000"""
import io, os, qrcode
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import Response
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

SHOP = os.getenv("SHOP_NAME", "Raiyani Agro Seeds")
ADDR = os.getenv("SHOP_ADDRESS", "Gondal, Gujarat")
GST = os.getenv("SHOP_GSTIN", "")
KEY = os.getenv("INTERNAL_API_KEY", "")
app = FastAPI(docs_url=None, redoc_url=None)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/invoice")
async def invoice(request: Request, x_api_key: str = Header(default="")):
    if not KEY or x_api_key != KEY:
        raise HTTPException(401, "Unauthorized")
    o = await request.json()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 25 * mm
    c.setFont("Helvetica-Bold", 18); c.drawString(20 * mm, y, SHOP)
    c.setFont("Helvetica", 9); y -= 6 * mm; c.drawString(20 * mm, y, ADDR)
    if GST: y -= 5 * mm; c.drawString(20 * mm, y, f"GSTIN: {GST}")
    c.setFont("Helvetica-Bold", 12); c.drawRightString(w - 20 * mm, h - 25 * mm, "INVOICE")
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 20 * mm, h - 31 * mm, f"Order #{o.get('_id', '')[-8:].upper()}")
    c.drawRightString(w - 20 * mm, h - 36 * mm, f"Date: {str(o.get('createdAt', ''))[:10]}")
    c.drawRightString(w - 20 * mm, h - 41 * mm, f"Payment: {o.get('paymentMethod', '').upper()} ({o.get('paymentStatus', '')})")
    y -= 14 * mm
    s = o.get("shipping", {})
    c.setFont("Helvetica-Bold", 10); c.drawString(20 * mm, y, "Bill to")
    c.setFont("Helvetica", 9)
    for line in (s.get("name", ""), s.get("phone", ""), s.get("address", "")):
        y -= 5 * mm; c.drawString(20 * mm, y, str(line)[:90])
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 9)
    for x, t in ((20, "Item"), (115, "Qty"), (135, "Price"), (170, "Amount")):
        c.drawString(x * mm, y, t)
    c.line(20 * mm, y - 2 * mm, w - 20 * mm, y - 2 * mm)
    c.setFont("Helvetica", 9)
    for it in o.get("items", []):
        y -= 6 * mm
        c.drawString(20 * mm, y, str(it["name"])[:55]); c.drawString(115 * mm, y, str(it["qty"]))
        c.drawString(135 * mm, y, f"Rs {it['price']:.2f}"); c.drawString(170 * mm, y, f"Rs {it['price'] * it['qty']:.2f}")
    y -= 10 * mm
    for label, val in (("Items total", o.get("itemsTotal", 0)), ("Shipping", o.get("shippingFee", 0))):
        c.drawString(135 * mm, y, label); c.drawString(170 * mm, y, f"Rs {val:.2f}"); y -= 5 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(135 * mm, y, "Total"); c.drawString(170 * mm, y, f"Rs {o.get('totalAmount', 0):.2f}")
    qr = qrcode.make(f"{SHOP}|order:{o.get('_id', '')}|total:{o.get('totalAmount', 0)}")
    q = io.BytesIO(); qr.save(q, format="PNG"); q.seek(0)
    c.drawImage(ImageReader(q), 20 * mm, 20 * mm, 28 * mm, 28 * mm)
    c.setFont("Helvetica", 8); c.drawString(52 * mm, 30 * mm, "Thank you for shopping with us!")
    c.showPage(); c.save()
    return Response(buf.getvalue(), media_type="application/pdf")
