"""Small read-only Twitch Helix viewer-count proxy."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


CLIENT_ID = os.environ.get("TWITCH_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("TWITCH_CLIENT_SECRET", "")
PORT = int(os.environ.get("PORT", "8000"))
TOKEN_URL = "https://id.twitch.tv/oauth2/token"
STREAMS_URL = "https://api.twitch.tv/helix/streams"
CHANNEL_RE = re.compile(r"^[A-Za-z0-9_]{1,25}$")
_token_lock = threading.Lock()
_access_token = None
_token_expires_at = 0.0


def get_app_token():
    """Return cached app token; fetch a replacement before it expires."""
    global _access_token, _token_expires_at
    with _token_lock:
        if _access_token and time.monotonic() < _token_expires_at - 60:
            return _access_token
        body = urlencode({
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "client_credentials",
        }).encode()
        request = Request(TOKEN_URL, data=body, method="POST")
        with urlopen(request, timeout=10) as response:
            data = json.load(response)
        _access_token = data["access_token"]
        _token_expires_at = time.monotonic() + int(data["expires_in"])
        return _access_token


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self.respond(200, {"status": "ok"})
        if parsed.path != "/api/twitch/viewers":
            return self.respond(404, {"error": "not_found"})
        channel = parse_qs(parsed.query).get("channel", [""])[0]
        if not CHANNEL_RE.fullmatch(channel):
            return self.respond(400, {"error": "invalid_channel"})
        if not CLIENT_ID or not CLIENT_SECRET:
            return self.respond(503, {"error": "proxy_not_configured"})

        try:
            token = get_app_token()
            query = urlencode({"user_login": channel})
            request = Request(f"{STREAMS_URL}?{query}", headers={
                "Client-Id": CLIENT_ID,
                "Authorization": f"Bearer {token}",
            })
            with urlopen(request, timeout=10) as response:
                streams = json.load(response).get("data", [])
            count = streams[0]["viewer_count"] if streams else 0
            return self.respond(200, {"channel": channel, "viewer_count": count})
        except HTTPError as error:
            # One refresh/retry handles tokens revoked before advertised expiry.
            if error.code == 401:
                global _token_expires_at
                with _token_lock:
                    _token_expires_at = 0
                try:
                    token = get_app_token()
                    request = Request(f"{STREAMS_URL}?{urlencode({'user_login': channel})}", headers={
                        "Client-Id": CLIENT_ID,
                        "Authorization": f"Bearer {token}",
                    })
                    with urlopen(request, timeout=10) as response:
                        streams = json.load(response).get("data", [])
                    count = streams[0]["viewer_count"] if streams else 0
                    return self.respond(200, {"channel": channel, "viewer_count": count})
                except Exception:
                    pass
            self.log_error("Twitch API returned HTTP %s", error.code)
            return self.respond(502, {"error": "twitch_api_error"})
        except (URLError, TimeoutError, ValueError, KeyError) as error:
            self.log_error("Twitch request failed: %s", error)
            return self.respond(502, {"error": "twitch_request_failed"})

    def log_message(self, format, *args):
        # Avoid access logs echoing untrusted request strings.
        super().log_message(format, *args)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
