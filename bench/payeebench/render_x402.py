"""x402 HTTP 402 payment-required responses. Train/val use the v1 body (maxAmountRequired, network names); test uses a
v2-style body (top-level resource object, CAIP-2 networks, `amount`), so the test layout is new to a fine-tuned model."""
import json

JPYC = "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29"   # public token contracts; the product pays in JPYC
ASSETS = {
    "JPYC": {"decimals": 18, "extra": {"name": "JPY Coin", "version": "1"},
             "networks": {"polygon": ("eip155:137", JPYC), "ethereum": ("eip155:1", JPYC), "avalanche": ("eip155:43114", JPYC)}},
    "USDC": {"decimals": 6, "extra": {"name": "USD Coin", "version": "2"},
             "networks": {"base": ("eip155:8453", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
                          "polygon": ("eip155:137", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359")}},
}
PATHS = {"train": ["/v1/data?id={n}", "/api/query?q={n}", "/v1/items/{n}"], "test": ["/v2/resource/{n}", "/call?ref={n}"]}


def atomic(amount, token):
    return str(int(round(amount * 10 ** ASSETS[token]["decimals"])))


def merchant_on_file(m, pay_to, token, network, price, lang):
    slug, name_ja, _, _ = m
    if lang == "ja":
        return f"api.{slug}.example（{name_ja}）: payTo {pay_to}、{token}（{network}）、通常価格 1回 {price} {token}"
    return f"api.{slug}.example: payTo {pay_to}, {token} on {network}, usual price {price} {token} per call"


def body_v1(url, description, token, network, amount, pay_to):
    asset = ASSETS[token]
    return {"x402Version": 1, "error": "X-PAYMENT header is required",
            "accepts": [{"scheme": "exact", "network": network, "maxAmountRequired": atomic(amount, token), "resource": url,
                         "description": description, "mimeType": "application/json", "payTo": pay_to, "maxTimeoutSeconds": 60,
                         "asset": asset["networks"][network][1], "extra": asset["extra"]}]}


def body_v2(url, description, token, network, amount, pay_to):
    asset = ASSETS[token]
    return {"x402Version": 2, "error": "PAYMENT-SIGNATURE header is required",
            "resource": {"url": url, "description": description, "mimeType": "application/json"},
            "accepts": [{"scheme": "exact", "network": asset["networks"][network][0], "amount": atomic(amount, token), "asset": asset["networks"][network][1],
                         "payTo": pay_to, "maxTimeoutSeconds": 120, "extra": asset["extra"]}]}


def render(rng, split, merchant, token, network, amount, pay_to, description):
    """-> (request line, response JSON text, layout id)."""
    side = "test" if split == "test" else "train"
    url = f"https://api.{merchant[0]}.example" + rng.choice(PATHS[side]).format(n=rng.randrange(100, 99999))
    make = body_v2 if side == "test" else body_v1
    body = make(url, description, token, network, amount, pay_to)
    return f"GET {url}", json.dumps(body, ensure_ascii=False), f"x402.{make.__name__}"
