"""Pricing a locally served model. There is no token bill, so the marginal cost is electricity for the time the
request occupies the machine. Both numbers are assumptions (macOS exposes package power only to root), stated in the
README next to every local cost figure."""
from dataclasses import dataclass

ASSUMED_WATTS = 60.0          # M5 Max package power under sustained GPU load, an upper bound for a 0.8B model
TOKYO_USD_PER_KWH = 0.21      # about ¥31/kWh (Tokyo residential tariff) at ¥150/$

# the same model on rented hardware, from Kev's published serving table (Kev-0.8B on an L4 at $0.80/h, 62.8 req/s)
L4_USD_PER_HOUR, L4_REQUESTS_PER_SECOND = 0.80, 62.8


@dataclass(frozen=True)
class Energy:
    watts: float = ASSUMED_WATTS
    usd_per_kwh: float = TOKYO_USD_PER_KWH

    def usd(self, wall_ms):
        return wall_ms / 1000 * self.watts / 3.6e6 * self.usd_per_kwh


def l4_usd_per_1k():
    """Kev-0.8B served on a rented L4 at full batching: dollars per 1,000 requests."""
    return 1000 * L4_USD_PER_HOUR / 3600 / L4_REQUESTS_PER_SECOND
