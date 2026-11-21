"""Offline Chromium layout audit. Requires Python Playwright and an installed Chromium."""
import argparse
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

PUBLIC = Path(__file__).resolve().parents[1] / "public"
parser = argparse.ArgumentParser()
parser.add_argument("--chromium")
parser.add_argument("--screenshots", type=Path, required=True)
args = parser.parse_args()
args.screenshots.mkdir(exist_ok=True, parents=True)
failures = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.chromium)
    for width in (375, 390, 768, 1024, 1440):
        for file in sorted(PUBLIC.glob("*.html")):
            name = file.name
            if name == "Eagles-register.html":  # intentionally redirects
                continue
            context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            role = "admin" if name in ("admin.html", "speaking-review.html") else "approved"
            profile = {"firstName": "QA", "lastName": "Student", "groupName": "QA", "canCreateTests": True}
            fixtures = {
                "/api/me": {"status": role, "profile": profile},
                "/api/dashboard": {"status": role, "profile": profile, "activity": []},
                "/api/quizzes": {"quizzes": []}, "/api/reading/catalog": {"tests": [], "editor": True},
                "/api/reading/mine": [], "/api/speaking/config": {"recordingAvailable": False},
                "/api/quiz-results/mine": {"summary": {"testsTaken": 0}, "results": [], "totalResults": 0},
                "/api/live-sessions/mine": {"rooms": []}, "/api/quiz-results/sessions": {"sessions": []},
                "/api/speaking/mine": {"submissions": []}, "/api/speaking/review-queue": {"submissions": []},
                "/api/admin/students": {"students": []}
            }

            def serve(route):
                url = urlsplit(route.request.url)
                if url.netloc != "eagles.test":
                    route.abort()
                    return
                if url.path.startswith("/api/"):
                    route.fulfill(status=200 if url.path in fixtures else 503, content_type="application/json",
                                  body=json.dumps(fixtures.get(url.path, {"error": "Offline fixture unavailable"})))
                    return
                path = PUBLIC / url.path.lstrip("/")
                if path.is_file() and path.resolve().is_relative_to(PUBLIC):
                    route.fulfill(path=str(path), content_type=mimetypes.guess_type(path)[0] or "application/octet-stream")
                else:
                    route.fulfill(status=404, body="")

            context.route("**/*", serve)
            if name != "index.html":
                context.add_init_script("localStorage.setItem('eaglesLanguage','ru')")
            if name not in ("index.html", "join.html", "account.html"):
                context.add_init_script("localStorage.setItem('eaglesIdToken','offline-fixture')")
            page = context.new_page()
            page.on("pageerror", lambda err: failures.append((width, name, str(err))))
            page.goto("https://eagles.test/" + name, wait_until="networkidle")

            def capture(state):
                if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                    failures.append((width, name, state + " overflow"))
                page.screenshot(path=str(args.screenshots / f"{width}-{file.stem}-{state}.png"))

            capture("initial")
            toggle = page.locator(".site-toggle")
            if toggle.count() and toggle.is_visible():
                toggle.click()
                if toggle.get_attribute("aria-expanded") != "true":
                    failures.append((width, name, "menu closed"))
                capture("menu")
                page.keyboard.press("Escape")
            if name == "quiz-builder.html":
                page.locator("#newQuiz").click()
                page.locator("#addQuestion").click()
                page.locator("#previewQuiz").click()
                capture("preview")
            context.close()
    browser.close()
if failures:
    raise AssertionError(failures)
