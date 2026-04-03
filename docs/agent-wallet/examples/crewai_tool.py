import os
import requests
from crewai.tools import BaseTool


class SatnamWalletBalanceTool(BaseTool):
    name = "satnam_wallet_balance"
    description = "Get Satnam agent wallet balance in sats"

    def _run(self) -> str:
        response = requests.get(
            f"{os.environ['SATNAM_BASE_URL']}/v1/agent-wallet",
            headers={"Authorization": f"Bearer {os.environ['SATNAM_AGENT_JWT']}"},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        return str(data["balance_sats"]["total"])


class SatnamWalletSendTool(BaseTool):
    name = "satnam_wallet_send"
    description = "Send sats through Satnam agent wallet"

    def _run(self, amount_sats: int, payment_uri: str) -> str:
        response = requests.post(
            f"{os.environ['SATNAM_BASE_URL']}/v1/agent-wallet/send",
            headers={
                "Authorization": f"Bearer {os.environ['SATNAM_AGENT_JWT']}",
                "Content-Type": "application/json",
            },
            json={
                "amount_sats": amount_sats,
                "payment_uri": payment_uri,
                "privacy_preference": "balanced",
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.text
