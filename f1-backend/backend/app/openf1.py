import asyncio
import httpx

BASE_URL = "https://api.openf1.org/v1"

class OpenF1:
    def __init__(self, timeout_s: float = 60.0):
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def get(self, endpoint: str, params: dict, retries: int = 3):
        url = f"{BASE_URL}/{endpoint}"
        last = None
        for attempt in range(retries):
            try:
                r = await self._client.get(url, params=params)
                if r.status_code == 404:
                    return []
                r.raise_for_status()
                return r.json()
            except Exception as e:
                last = e
                await asyncio.sleep(1.0 * (attempt + 1))
        raise RuntimeError(f"OpenF1 failed: {endpoint} {params}. Last: {last}")

    async def sessions_by_year(self, year: int, session_name: str = "Race"):
        return await self.get("sessions", {"year": year, "session_name": session_name})

    async def session_meta(self, session_key: int):
        out = await self.get("sessions", {"session_key": session_key})
        return out[0] if out else {}

    async def laps(self, session_key: int):        return await self.get("laps", {"session_key": session_key})
    async def stints(self, session_key: int):      return await self.get("stints", {"session_key": session_key})
    async def drivers(self, session_key: int):     return await self.get("drivers", {"session_key": session_key})
    async def intervals(self, session_key: int):   return await self.get("intervals", {"session_key": session_key})
    async def weather(self, session_key: int):     return await self.get("weather", {"session_key": session_key})
    async def race_control(self, session_key: int):return await self.get("race_control", {"session_key": session_key})