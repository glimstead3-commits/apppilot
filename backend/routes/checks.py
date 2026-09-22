"""App check — actually inspect the user's live app instead of taking their
word for it. The wow feature: the mentor verifies, not just advises.

POST /api/projects/{id}/check {url} → runs plain-English checks (reachable,
HTTPS, exposed files, security headers, speed) and saves the result on the
project so the mentor can reference it.

SSRF note: we fetch user-supplied URLs server-side, so every hop is
validated — http/https only, and the host must resolve to a public IP.
"""
import ipaddress
import socket
import time
from collections import defaultdict
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone

import requests
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.database import get_db

router = APIRouter(prefix="/api/projects")

_buckets = defaultdict(list)

def _rate_limit(key: str, max_calls: int, window_s: int):
    now = time.time()
    hits = [t for t in _buckets[key] if now - t < window_s]
    _buckets[key] = hits
    if len(hits) >= max_calls:
        raise HTTPException(status_code=429, detail="Slow down — try again in a minute")
    hits.append(now)


class CheckRequest(BaseModel):
    url: str


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


# --- SSRF guard: the host must be a public address on every hop ----------

def _public_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except Exception:
            return False
        if not ip.is_global:
            return False
    return True


def _normalize(url: str) -> str:
    url = url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Paste your app's address first")
    if "://" not in url:
        url = "https://" + url
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(status_code=400, detail="That doesn't look like a web address")
    if not _public_host(p.hostname):
        raise HTTPException(status_code=400,
                            detail="That address isn't publicly reachable — use your live URL")
    return url


def _get(url: str, timeout: int = 10):
    """GET with manual redirect following — each hop is re-validated so a
    public URL can't bounce us into a private one."""
    for _ in range(3):
        r = requests.get(url, timeout=timeout, allow_redirects=False,
                         headers={"User-Agent": "AppPilot-Check/1.0"},
                         stream=True)
        if r.status_code in (301, 302, 303, 307, 308):
            loc = r.headers.get("location", "")
            url = urljoin(url, loc)
            p = urlparse(url)
            if p.scheme not in ("http", "https") or not p.hostname \
                    or not _public_host(p.hostname):
                raise ValueError("Redirect to an unsafe address")
            continue
        return r, url
    raise ValueError("Too many redirects")


def _sample(url: str, limit: int = 400) -> tuple:
    """GET a path and return (status, first `limit` chars). Used to probe for
    accidentally-public files on the user's own app."""
    try:
        r, _ = _get(url, timeout=8)
        return r.status_code, r.text[:limit]
    except Exception:
        return 0, ""


# --- The checks themselves — plain English, each with a fix ---------------

def _check(status: str, title: str, detail: str, fix: str = "") -> dict:
    return {"status": status, "title": title, "detail": detail, "fix": fix}


def run_checks(url: str) -> list:
    checks = []

    try:
        t0 = time.time()
        r, final_url = _get(url)
        ms = int((time.time() - t0) * 1000)
    except requests.exceptions.SSLError:
        return [_check("fail", "It loads at all",
                       "The address exists but its security certificate is broken — browsers will warn visitors away.",
                       "If you're on Render/Netlify/Vercel, this fixes itself once the domain finishes provisioning — or re-issue the certificate in settings.")]
    except Exception:
        return [_check("fail", "It loads at all",
                       "Nothing answered at that address — wrong URL, or the app isn't actually deployed yet.",
                       "Open the URL in your own browser first. If it doesn't load for you, it doesn't load for anyone.")]

    checks.append(_check(
        "pass" if r.status_code < 400 else "warn" if r.status_code < 500 else "fail",
        "It loads",
        f"The app answered (status {r.status_code}) in {ms / 1000:.1f}s.",
        "" if r.status_code < 400 else
        "A 4xx means visitors hit a wall — check the page isn't behind a login it shouldn't have."
        if r.status_code < 500 else
        "A 5xx means the app is crashing — check its logs before anything else."))

    https_url = final_url.startswith("https://")
    checks.append(_check(
        "pass" if https_url else "fail",
        "It's on HTTPS",
        "Traffic is encrypted." if https_url else
        "The app is served over plain HTTP — anything users type can be read in transit.",
        "" if https_url else
        "Every modern host (Render, Vercel, Netlify) gives free HTTPS — turn it on in settings, it's usually one toggle."))

    if https_url:
        http_probe = "http://" + urlparse(final_url).netloc + urlparse(final_url).path
        # Single hop, no following — we want to SEE the redirect, not ride it.
        try:
            hp = requests.get(http_probe, timeout=8, allow_redirects=False,
                              headers={"User-Agent": "AppPilot-Check/1.0"})
            st, loc = hp.status_code, hp.headers.get("location", "")
        except Exception:
            st, loc = 0, ""
        if st in (301, 302, 303, 307, 308) and (loc.startswith("https") or loc.startswith("/")):
            checks.append(_check("pass", "HTTP forwards to HTTPS",
                                 "Anyone hitting the old http:// address gets bumped to the secure one."))
        elif st == 0:
            checks.append(_check("warn", "HTTP forwards to HTTPS",
                                 "Couldn't verify the http:// version — it may just be closed, which is fine."))
        else:
            checks.append(_check("warn", "HTTP forwards to HTTPS",
                                 "The http:// version answers instead of redirecting — some visitors may never get the secure site.",
                                 "Look for a 'force HTTPS' or 'redirect HTTP' setting on your host."))

    leaks = []
    for path, marker in (("/.env", "="), ("/.git/HEAD", "ref:")):
        st, body = _sample(urljoin(final_url, path))
        if st == 200 and marker in body:
            leaks.append(path)
    checks.append(_check(
        "fail" if leaks else "pass",
        "Secrets aren't exposed",
        f"{' and '.join(leaks)} {'is' if len(leaks) == 1 else 'are'} publicly readable — treat every key in them as stolen."
        if leaks else "Common leak spots (.env, .git) aren't publicly readable.",
        "Take the files offline NOW, then rotate every key inside them — assume they were scraped the moment they went live."
        if leaks else ""))

    h = {k.lower(): v for k, v in r.headers.items()}
    missing = [n for n in ("content-security-policy", "x-content-type-options", "referrer-policy")
               if n not in h]
    if "x-frame-options" not in h and "frame-ancestors" not in h.get("content-security-policy", ""):
        missing.append("x-frame-options")
    if https_url and "strict-transport-security" not in h:
        missing.append("strict-transport-security")
    checks.append(_check(
        "pass" if not missing else "warn",
        "Browser armor (security headers)",
        "All the common protective headers are set." if not missing else
        f"Missing: {', '.join(missing)}. These are free one-line settings that block whole classes of attacks.",
        "" if not missing else
        "Ask your AI builder: 'add these security headers to my app: " + ", ".join(missing) + "' — it knows what to do."))

    powered = h.get("x-powered-by") or h.get("server")
    generic_host = (powered or "").lower() in ("cloudflare", "nginx", "vercel", "render")
    checks.append(_check(
        "warn" if powered and not generic_host else "pass",
        "Doesn't advertise its engine",
        "The app doesn't broadcast what it's built with." if not powered else
        f"It names its engine ('{powered}') — just the platform, harmless." if generic_host else
        f"It tells the world its engine ('{powered}') — free recon for attackers.",
        "" if not powered or generic_host else
        "Ask your builder to remove the X-Powered-By/Server header — it's a one-liner."))

    checks.append(_check(
        "pass" if ms < 3000 else "warn",
        "Loads fast enough",
        f"First response took {ms / 1000:.1f}s — visitors won't notice." if ms < 3000 else
        f"First response took {ms / 1000:.1f}s — slow enough that visitors bounce before it loads.",
        "" if ms < 3000 else
        "Often a cold start on a free host (Render free tier sleeps) — load it again; if it's always slow, ask your builder to profile it."))

    return checks


@router.post("/{project_id}/check")
def check_app(project_id: str, body: CheckRequest, user=Depends(get_current_user)):
    _rate_limit(f"check:{user['_id']}", 6, 60)
    db = _db()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    if not db.projects.find_one({"_id": oid, "user_id": user["_id"]}):
        raise HTTPException(status_code=404, detail="Project not found")

    url = _normalize(body.url)
    checks = run_checks(url)
    passed = sum(1 for c in checks if c["status"] == "pass")
    result = {
        "url": url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "passed": passed,
        "total": len(checks),
        "checks": checks,
    }
    db.projects.update_one({"_id": oid},
                           {"$set": {"app_url": url, "last_check": result}})
    return result
