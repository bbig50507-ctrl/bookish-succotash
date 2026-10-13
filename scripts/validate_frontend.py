#!/usr/bin/env python3
"""Lightweight, dependency-free checks for Dar's static HTML entry points."""
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = (ROOT / "index.html", ROOT / "public" / "index.html")


class EntryPointParser(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids = set()
        self.errors = []
        self.has_title = False
        self.has_lang = False
        self.has_viewport = False
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html" and attrs.get("lang"):
            self.has_lang = True
        if tag == "meta" and attrs.get("name", "").lower() == "viewport":
            self.has_viewport = True
        if tag == "title":
            self.in_title = True
        element_id = attrs.get("id")
        if element_id:
            if element_id in self.ids:
                self.errors.append(f"duplicate id: {element_id}")
            self.ids.add(element_id)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title and data.strip():
            self.has_title = True


def main():
    errors = []
    for path in FILES:
        if not path.is_file():
            errors.append(f"{path.relative_to(ROOT)} is missing")
            continue
        parser = EntryPointParser(path)
        try:
            parser.feed(path.read_text(encoding="utf-8"))
            parser.close()
        except Exception as exc:
            errors.append(f"{path.relative_to(ROOT)}: HTML parsing failed ({type(exc).__name__})")
            continue
        for label, ok in (
            ("document title", parser.has_title),
            ("html lang attribute", parser.has_lang),
            ("viewport meta", parser.has_viewport),
        ):
            if not ok:
                errors.append(f"{path.relative_to(ROOT)}: missing {label}")
        errors.extend(f"{path.relative_to(ROOT)}: {item}" for item in parser.errors)

    if errors:
        print("Dar HTML checks failed:")
        for error in errors:
            print(f" - {error}")
        return 1
    print("Dar HTML checks passed for both entry points.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
