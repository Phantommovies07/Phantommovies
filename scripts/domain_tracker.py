#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
PHANTOM MOVIES - DYNAMIC DOMAIN & LIVE MIRROR RESOLUTION ENGINE
═══════════════════════════════════════════════════════════════════════════════
Automatically discovers, probes, tests, and updates live/active domains for:
  • VegaMovies (handles meta-refresh, pages.dev, .beer -> .pics redirect chains)
  • HDHub4u (handles base64 API at h4.suncdn.org/host/)
  • RogMovies (handles .one, .in, .click redirect tracking)
  • HDMovie2 / HDVB (handles P2P streaming player gateway resolution)
  • AllMovieLand (handles link hubs and 1xcinema mirrors)
  • NetMirror (handles net27 -> net79 CDN node rotation)
  • KMMovies (handles multi-tld mirror rotations)

Updates: phantommovies_site/data/mirrors.json
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import json
import time
import ssl
import re
import base64
import socket
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple

import sys

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRRORS_FILE = os.path.join(BASE_DIR, "data", "mirrors.json")

# In case run from root repo
if not os.path.exists(MIRRORS_FILE):
    alt_path = os.path.join(os.path.dirname(BASE_DIR), "phantommovies_site", "data", "mirrors.json")
    if os.path.exists(alt_path):
        MIRRORS_FILE = alt_path

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
}

TARGET_REGISTRY = {
    "vegamovies": {
        "name": "VegaMovies",
        "gateways": [
            "https://1vegamovies.beer",
            "https://vegamovies.is",
            "https://vegamovies.pages.dev"
        ],
        "seeds": [
            "https://1vegamovies.pics",
            "https://1vegamovies.beer",
            "https://1vegamovies.baby",
            "https://vegamovies.is",
            "https://vegamovies.bar",
            "https://vegamovies.yt",
            "https://vegamovies.llc"
        ],
        "fingerprint": r'vegamovies'
    },
    "hdhub4u": {
        "name": "HDHub4u",
        "api": "https://h4.suncdn.org/host/",
        "gateways": [
            "https://hdhub4u.bi",
            "https://hdhub4u.ag",
            "https://hdhub4u.ms"
        ],
        "seeds": [
            "https://new8.hdhub4u.cl",
            "https://hdhub4u.fans",
            "https://new3.hdhub4u.free",
            "https://hdhub4u.bi"
        ],
        "fingerprint": r'hdhub4u'
    },
    "rogmovies": {
        "name": "RogMovies",
        "gateways": [
            "https://rogmovies.one"
        ],
        "seeds": [
            "https://rogmovies.one",
            "https://rogmovies.in",
            "https://rogmovies.shop",
            "https://rogmovies.click",
            "https://rogmovies.vip"
        ],
        "fingerprint": r'rogmovies'
    },
    "allmovieland": {
        "name": "AllMovieLand (HDVB P2P)",
        "gateways": [
            "https://allmovieland.link",
            "https://1xcinema.net"
        ],
        "seeds": [
            "https://slast430did.com",
            "https://allmovieland.link",
            "https://1xcinema.net"
        ],
        "fingerprint": r'allmovieland|hdvb|cinema|play'
    },
    "hdmovie2": {
        "name": "HDMovie2 (P2P HLS)",
        "gateways": [
            "https://hdmovie2.menu",
            "https://hdmovie2.rest"
        ],
        "seeds": [
            "https://gorri421kos.com",
            "https://slast430did.com",
            "https://hdmovie2.menu",
            "https://hdmovie2.rest"
        ],
        "fingerprint": r'hdmovie2|play|stream|video'
    },
    "netmirror": {
        "name": "NetMirror (VIP Ultra HD)",
        "gateways": [
            "https://net27.cc",
            "https://netmirror.app"
        ],
        "seeds": [
            "https://net79.cc",
            "https://net27.cc",
            "https://netmirror.app"
        ],
        "fingerprint": r'netmirror|net27|net79|watch-tmdb|embed'
    },
    "cinesrc": {
        "name": "CineSrc (No Ads)",
        "gateways": [],
        "seeds": [
            "https://cinesrc.st"
        ],
        "fingerprint": r'cinesrc'
    },
    "vidlink": {
        "name": "VidLink (Fast HD)",
        "gateways": [],
        "seeds": [
            "https://vidlink.pro",
            "https://vidlink.online"
        ],
        "fingerprint": r'vidlink'
    }
}


class DomainTracker:
    def __init__(self, timeout: float = 6.0):
        self.timeout = timeout

    def check_url(self, url: str, fingerprint: Optional[str] = None) -> Tuple[bool, str, int, str]:
        """
        Tests connectivity, measures response latency, follows redirects,
        and verifies content fingerprint.
        Returns: (is_valid, final_url, latency_ms, status_or_reason)
        """
        if not url:
            return False, "", 0, "Empty URL"

        clean_url = url.strip()
        parsed = urllib.parse.urlparse(clean_url)
        hostname = parsed.netloc.split(':')[0]
        
        # 1. Fast DNS Check
        try:
            socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM)
        except Exception as e:
            return False, clean_url, 0, f"DNS Error ({e})"

        # 2. HTTP Probing
        t0 = time.time()
        try:
            req = urllib.request.Request(clean_url, headers=BROWSER_HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=self.timeout) as resp:
                elapsed_ms = int((time.time() - t0) * 1000)
                final_url = resp.geturl().rstrip('/')
                
                # Check for meta-refresh or JS redirect in body
                raw_bytes = resp.read(8192)
                html = raw_bytes.decode('utf-8', errors='ignore')
                
                # Check meta refresh tag: <meta http-equiv="refresh" content="3;url=https://...">
                meta_match = re.search(r'content=[\'"]\d+;\s*url=([^\'"]+)[\'"]', html, re.I)
                if meta_match:
                    redirect_target = meta_match.group(1).strip()
                    if redirect_target.startswith('http') and redirect_target != clean_url:
                        # Follow meta refresh
                        return self.check_url(redirect_target, fingerprint)

                # Check javascript window.location redirect
                js_match = re.search(r'window\.location(?:\.href)?\s*=\s*[\'"]([^\'"]+)[\'"]', html, re.I)
                if js_match:
                    js_target = js_match.group(1).strip()
                    if js_target.startswith('http') and js_target != clean_url:
                        return self.check_url(js_target, fingerprint)

                # Verify fingerprint if specified
                if fingerprint:
                    if not re.search(fingerprint, html, re.I) and not re.search(fingerprint, final_url, re.I):
                        # Some streaming embeds return minimal JSON or player shell
                        if resp.status not in (200, 204, 301, 302):
                            return False, final_url, elapsed_ms, "Fingerprint mismatch"

                return True, final_url, elapsed_ms, f"HTTP {resp.status}"

        except urllib.error.HTTPError as e:
            # Some CDNs or player iframes return 403 or 405 on direct root GET but are alive
            elapsed_ms = int((time.time() - t0) * 1000)
            if e.code in (403, 405, 302, 301):
                return True, clean_url, elapsed_ms, f"HTTP {e.code} (Alive)"
            return False, clean_url, elapsed_ms, f"HTTP {e.code}"
        except Exception as e:
            elapsed_ms = int((time.time() - t0) * 1000)
            return False, clean_url, elapsed_ms, str(e)

    def resolve_api_endpoint(self, api_url: str) -> Optional[str]:
        """Resolves dynamic base64 API endpoints (such as HDHub4u)."""
        try:
            req = urllib.request.Request(api_url, headers=BROWSER_HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if 'c' in data:
                    decoded = base64.b64decode(data['c']).decode('utf-8').strip()
                    # Strip any utm query params for clean domain
                    parsed = urllib.parse.urlparse(decoded)
                    return f"{parsed.scheme}://{parsed.netloc}"
        except Exception as e:
            print(f"  [API Error] {api_url}: {e}")
        return None

    def discover_provider(self, key: str, config: Dict) -> Dict:
        """
        Runs comprehensive discovery across API, gateways, and seed lists for a single provider.
        """
        name = config.get("name", key)
        fingerprint = config.get("fingerprint")
        candidates = []

        # 1. Check API endpoint if present
        if "api" in config:
            api_res = self.resolve_api_endpoint(config["api"])
            if api_res:
                candidates.append(api_res)

        # 2. Check gateways
        for gw in config.get("gateways", []):
            candidates.append(gw)

        # 3. Check seeds
        for s in config.get("seeds", []):
            if s not in candidates:
                candidates.append(s)

        results = []
        best_active = None
        min_latency = float('inf')

        for url in candidates:
            valid, final_url, latency, reason = self.check_url(url, fingerprint)
            res_entry = {
                "source": url,
                "resolved": final_url,
                "online": valid,
                "latency_ms": latency,
                "status": reason
            }
            results.append(res_entry)

            if valid and latency < min_latency:
                min_latency = latency
                best_active = final_url

        # Ensure trailing slash removed
        if best_active:
            best_active = best_active.rstrip('/')

        # Collect all unique online working mirrors
        working_mirrors = []
        for r in results:
            if r["online"] and r["resolved"]:
                clean = r["resolved"].rstrip('/')
                if clean not in working_mirrors:
                    working_mirrors.append(clean)

        return {
            "key": key,
            "name": name,
            "active": best_active or (working_mirrors[0] if working_mirrors else candidates[0]),
            "latency_ms": min_latency if best_active else 0,
            "mirrors": working_mirrors if working_mirrors else candidates,
            "probes": results
        }

    def run_all(self, update_file: bool = True) -> Dict:
        """Runs discovery for all registered target websites concurrently."""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting Live Domain Resolution across {len(TARGET_REGISTRY)} providers...")
        
        provider_results = {}
        with ThreadPoolExecutor(max_workers=6) as executor:
            future_to_key = {
                executor.submit(self.discover_provider, key, cfg): key
                for key, cfg in TARGET_REGISTRY.items()
            }
            for future in as_completed(future_to_key):
                key = future_to_key[future]
                try:
                    res = future.result()
                    provider_results[key] = res
                    status_badge = "ONLINE" if res["active"] else "OFFLINE"
                    print(f"  [+] [{status_badge}] {res['name']}: {res['active']} ({res['latency_ms']}ms) | Working mirrors: {len(res['mirrors'])}")
                except Exception as e:
                    print(f"  [-] [ERROR] {key}: {e}")

        if update_file:
            self.update_mirrors_json(provider_results)

        return provider_results

    def update_mirrors_json(self, results: Dict) -> None:
        """Saves verified live domains back to data/mirrors.json."""
        if not os.path.exists(MIRRORS_FILE):
            print(f"  [Warning] Mirrors file not found at: {MIRRORS_FILE}")
            return

        try:
            with open(MIRRORS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)

            data["updatedAt"] = datetime.now(timezone.utc).isoformat()
            
            # 1. Update Scrapers section
            if "scrapers" not in data:
                data["scrapers"] = {}

            for key in ["hdhub4u", "vegamovies", "rogmovies", "netmirror"]:
                if key in results:
                    r = results[key]
                    if key not in data["scrapers"]:
                        data["scrapers"][key] = {}
                    data["scrapers"][key]["active"] = r["active"]
                    data["scrapers"][key]["mirrors"] = r["mirrors"]
                    data["scrapers"][key]["latency_ms"] = r["latency_ms"]
                    data["scrapers"][key]["status"] = "online"

            # 2. Update Streaming Providers section
            if "streaming" in data and "providers" in data["streaming"]:
                for prov in data["streaming"]["providers"]:
                    pid = prov.get("id")
                    if pid in results:
                        r = results[pid]
                        active_dom = r["active"]
                        # Prepend active domain to domains list if not present
                        existing_domains = prov.get("domains", [])
                        if active_dom and active_dom not in existing_domains:
                            existing_domains.insert(0, active_dom)
                        elif active_dom in existing_domains:
                            existing_domains.remove(active_dom)
                            existing_domains.insert(0, active_dom)
                        prov["domains"] = existing_domains

            with open(MIRRORS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"\n[SUCCESS] Successfully synced live domains to {MIRRORS_FILE}")
        except Exception as e:
            print(f"[ERROR] Failed to write mirrors.json: {e}")


if __name__ == "__main__":
    tracker = DomainTracker(timeout=7.0)
    tracker.run_all(update_file=True)
