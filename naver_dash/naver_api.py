"""네이버 검색광고 API 최소 클라이언트 (표준 라이브러리만 사용).

환경변수
  NAVER_API_KEY       API 라이선스 (Access License)
  NAVER_SECRET_KEY    비밀키 (Secret Key)
  NAVER_CUSTOMER_ID   API 키를 발급한 계정(관리 계정)의 Customer ID
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.searchad.naver.com"


class NaverAdsAPI:
    def __init__(self):
        self.api_key = os.environ["NAVER_API_KEY"]
        self.secret = os.environ["NAVER_SECRET_KEY"].encode()
        self.manager_id = os.environ["NAVER_CUSTOMER_ID"]

    def _headers(self, method: str, uri: str, customer_id: str) -> dict:
        ts = str(int(time.time() * 1000))
        sig = hmac.new(self.secret, f"{ts}.{method}.{uri}".encode(), hashlib.sha256).digest()
        return {
            "X-Timestamp": ts,
            "X-API-KEY": self.api_key,
            "X-Customer": str(customer_id),
            "X-Signature": base64.b64encode(sig).decode(),
            "Content-Type": "application/json; charset=UTF-8",
        }

    def get(self, uri: str, params: dict | None = None, customer_id: str | None = None):
        """customer_id 를 주면 연결된 광고주 계정으로, 없으면 관리 계정으로 호출한다."""
        url = BASE + uri + ("?" + urllib.parse.urlencode(params) if params else "")
        req = urllib.request.Request(url, headers=self._headers("GET", uri, customer_id or self.manager_id))
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or "null")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{uri} → HTTP {e.code}: {e.read()[:300].decode(errors='replace')}") from None
