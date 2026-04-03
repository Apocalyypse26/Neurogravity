import os
import stripe
from typing import Dict, Any, Optional
import threading
import asyncio

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_processed_webhooks: Dict[str, float] = {}
_webhook_lock = threading.Lock()
_WEBHOOK_EXPIRY_SECONDS = 86400

_cached_prices: Dict[str, str] = {}
_price_cache_lock = threading.Lock()


async def _add_credits_to_user(user_id: str, credits: int) -> bool:
    """Add credits to user account via Supabase RPC (service role)"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("[STRIPE] ERROR: Supabase credentials not configured for credit addition")
        return False
    
    try:
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json"
        }
        
        async with asyncio.timeout(10):
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/buy_credits",
                    headers=headers,
                    json={"amount": credits}
                )
                
                if response.status_code in (200, 201):
                    print(f"[STRIPE] Successfully added {credits} credits to user {user_id}")
                    return True
                else:
                    print(f"[STRIPE] ERROR: Failed to add credits - {response.status_code}: {response.text}")
                    return False
    except asyncio.TimeoutError:
        print("[STRIPE] ERROR: Timeout adding credits to user")
        return False
    except Exception as e:
        print(f"[STRIPE] ERROR: Exception adding credits: {e}")
        return False


def _cleanup_expired_webhooks():
    import time
    current_time = time.time()
    expired = [
        event_id for event_id, timestamp in _processed_webhooks.items()
        if current_time - timestamp > _WEBHOOK_EXPIRY_SECONDS
    ]
    for event_id in expired:
        del _processed_webhooks[event_id]


def _is_webhook_processed(event_id: str) -> bool:
    return event_id in _processed_webhooks


def _mark_webhook_processed(event_id: str):
    import time
    _processed_webhooks[event_id] = time.time()
    _cleanup_expired_webhooks()


def _get_or_create_price(plan_id: str, price_cents: int, product_name: str) -> str:
    with _price_cache_lock:
        if plan_id in _cached_prices:
            return _cached_prices[plan_id]
        
        product = stripe.Product.create(
            name=f"NEUROX {product_name}",
            active=True,
        )
        
        price = stripe.Price.create(
            currency="usd",
            unit_amount=price_cents,
            recurring={"interval": "month"},
            product=product.id,
        )
        
        _cached_prices[plan_id] = price.id
        
        return price.id

CREDIT_PACKAGES = {
    "credits_10": {"name": "10 Scans", "credits": 10, "price_cents": 1500, "price_display": "$15"},
    "credits_50": {"name": "50 Scans", "credits": 50, "price_cents": 4900, "price_display": "$49"},
    "credits_200": {"name": "200 Scans", "credits": 200, "price_cents": 9900, "price_display": "$99"},
}

SUBSCRIPTION_PLANS = {
    "prime_monthly": {"name": "Prime Operator", "credits_per_month": 999, "price_cents": 2900, "price_display": "$29/mo"},
}


class StripeService:
    def __init__(self):
        self.enabled = bool(stripe.api_key)
        if self.enabled:
            print("[STRIPE] Initialized with API key")
        else:
            print("[STRIPE] No API key found - payment features disabled")

    def create_checkout_session(
        self,
        package_id: str,
        user_id: str,
        email: str,
        success_url: str,
        cancel_url: str,
    ) -> Dict[str, Any]:
        if not self.enabled:
            raise ValueError("Stripe is not configured. Set STRIPE_SECRET_KEY.")

        if package_id not in CREDIT_PACKAGES:
            raise ValueError(f"Invalid package: {package_id}")

        pkg = CREDIT_PACKAGES[package_id]

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"NEUROX {pkg['name']}",
                            "description": f"Add {pkg['credits']} analysis scans to your NEUROX account",
                        },
                        "unit_amount": pkg["price_cents"],
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            customer_email=email,
            metadata={
                "user_id": user_id,
                "package_id": package_id,
                "credits": pkg["credits"],
            },
        )

        return {"url": session.url, "session_id": session.id}

    def create_subscription_checkout(
        self,
        plan_id: str,
        user_id: str,
        email: str,
        success_url: str,
        cancel_url: str,
    ) -> Dict[str, Any]:
        if not self.enabled:
            raise ValueError("Stripe is not configured. Set STRIPE_SECRET_KEY.")

        if plan_id not in SUBSCRIPTION_PLANS:
            raise ValueError(f"Invalid plan: {plan_id}")

        plan = SUBSCRIPTION_PLANS[plan_id]

        price_id = _get_or_create_price(plan_id, plan["price_cents"], plan["name"])

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            customer_email=email,
            metadata={
                "user_id": user_id,
                "plan_id": plan_id,
            },
        )

        return {"url": session.url, "session_id": session.id}

    def handle_webhook(self, payload: bytes, sig_header: str) -> Dict[str, Any]:
        if not self.enabled:
            raise ValueError("Stripe is not configured")

        if not STRIPE_WEBHOOK_SECRET:
            raise ValueError("STRIPE_WEBHOOK_SECRET not set")

        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )

        event_id = event.get("id", "")
        
        with _webhook_lock:
            if _is_webhook_processed(event_id):
                print(f"[WEBHOOK] Duplicate event already processed: {event_id}")
                return {"event": "duplicate", "message": "Event already processed"}
            
            _mark_webhook_processed(event_id)

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            metadata = session.get("metadata", {})
            user_id = metadata.get("user_id")
            credits = int(metadata.get("credits", 0))
            
            if user_id and credits > 0:
                try:
                    asyncio.run(_add_credits_to_user(user_id, credits))
                except Exception as e:
                    print(f"[WEBHOOK] Warning: Credit addition failed but webhook processed: {e}")
            
            return {
                "event": "credits_purchased",
                "user_id": user_id,
                "credits": credits,
                "package_id": metadata.get("package_id"),
                "session_id": session["id"],
            }

        elif event["type"] == "invoice.paid":
            invoice = event["data"]["object"]
            return {
                "event": "subscription_renewed",
                "customer_email": invoice.get("customer_email"),
                "amount": invoice.get("amount_paid"),
            }

        elif event["type"] == "customer.subscription.deleted":
            return {
                "event": "subscription_cancelled",
                "subscription_id": event["data"]["object"]["id"],
            }

        return {"event": event["type"]}

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if not self.enabled:
            raise ValueError("Stripe is not configured")
        session = stripe.checkout.Session.retrieve(session_id)
        return {
            "id": session.id,
            "status": session.status,
            "payment_status": session.payment_status,
            "metadata": session.metadata,
        }


stripe_service = StripeService()
