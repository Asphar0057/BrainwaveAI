"""Operator-supplied prices, captured with usage; never infer cost from subscription revenue."""
import json
import math
import os


def cost_metadata(provider, model, usage):
    try:
        prices = json.loads(os.getenv("AI_MODEL_PRICES_JSON", "{}"))
        rates = prices[f"{provider}:{model}"]
        incoming, outgoing = float(rates["input_per_million_usd"]), float(rates["output_per_million_usd"])
        if not all(math.isfinite(v) and v >= 0 for v in (incoming, outgoing)):
            raise ValueError("Invalid price")
        cost = (max(0, int(usage.get("prompt_tokens", 0))) * incoming + max(0, int(usage.get("completion_tokens", 0))) * outgoing) / 1_000_000
        return {"estimated_cost_usd": cost, "cost_basis": "operator_configured", "price_version": str(rates.get("version", "unspecified"))}
    except (ValueError, TypeError, KeyError):
        return {"estimated_cost_usd": None, "cost_basis": "unpriced"}
