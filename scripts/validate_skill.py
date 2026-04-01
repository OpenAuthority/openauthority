#!/usr/bin/env python3
"""Validate a skill folder's SKILL.md frontmatter and structure."""

import json
import os
import re
import sys
from typing import Dict, List, Optional


def parse_frontmatter(content: str) -> Optional[dict]:
    """Parse YAML frontmatter from SKILL.md content using regex."""
    match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return None

    fm = {}
    raw = match.group(1)

    # Parse simple key: value pairs and multi-line strings
    current_key = None
    current_value_lines = []

    for line in raw.split("\n"):
        # Skip blank lines in multi-line context
        if not line.strip() and current_key:
            current_value_lines.append("")
            continue

        # Check for a new top-level key (not indented, has colon)
        key_match = re.match(r"^(\w[\w-]*)\s*:\s*(.*)", line)
        if key_match and not line.startswith(" ") and not line.startswith("\t"):
            # Save previous key
            if current_key:
                fm[current_key] = _finalize_value(current_value_lines)
            current_key = key_match.group(1)
            current_value_lines = [key_match.group(2).strip()]
        elif current_key:
            current_value_lines.append(line.strip())

    # Save last key
    if current_key:
        fm[current_key] = _finalize_value(current_value_lines)

    return fm


def _finalize_value(lines: list[str]) -> str:
    """Join multi-line value, strip YAML indicators."""
    text = " ".join(l for l in lines if l).strip()
    # Remove YAML multi-line indicators
    if text.startswith(">") or text.startswith("|"):
        text = text[1:].strip()
    # Remove surrounding quotes
    if (text.startswith('"') and text.endswith('"')) or (
        text.startswith("'") and text.endswith("'")
    ):
        text = text[1:-1]
    return text


def validate(skill_dir: str) -> list[str]:
    """Validate a skill directory. Returns a list of error messages."""
    errors = []
    warnings = []

    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        errors.append("SKILL.md not found")
        return errors

    with open(skill_md, "r") as f:
        content = f.read()

    # Parse frontmatter
    fm = parse_frontmatter(content)
    if fm is None:
        errors.append("SKILL.md has no YAML frontmatter (missing --- delimiters)")
        return errors

    # Check required fields
    required = ["name", "version", "description", "author", "license"]
    for field in required:
        if field not in fm or not fm[field]:
            errors.append(f"Missing required frontmatter field: {field}")

    # Check name matches folder
    folder_name = os.path.basename(os.path.normpath(skill_dir))
    if "name" in fm and fm["name"] != folder_name:
        errors.append(
            f"Frontmatter name '{fm['name']}' does not match folder name '{folder_name}'"
        )

    # Check line count
    body_start = content.find("---", 3)
    if body_start != -1:
        body = content[body_start + 3 :]
        line_count = body.count("\n")
        if line_count > 500:
            warnings.append(
                f"SKILL.md body is {line_count} lines (recommended: under 500)"
            )

    # Check evals exist
    evals_file = os.path.join(skill_dir, "evals", "evals.json")
    if not os.path.isfile(evals_file):
        errors.append("evals/evals.json not found")
    else:
        try:
            with open(evals_file, "r") as f:
                evals_data = json.load(f)
            if "evals" not in evals_data:
                errors.append("evals/evals.json missing 'evals' key")
            elif not isinstance(evals_data["evals"], list) or len(evals_data["evals"]) == 0:
                errors.append("evals/evals.json has no eval entries")
        except json.JSONDecodeError as e:
            errors.append(f"evals/evals.json is not valid JSON: {e}")

    # Print warnings
    for w in warnings:
        print(f"  WARNING: {w}")

    return errors


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <skill-directory>")
        sys.exit(1)

    skill_dir = sys.argv[1]
    if not os.path.isdir(skill_dir):
        print(f"Error: '{skill_dir}' is not a directory")
        sys.exit(1)

    print(f"Validating {skill_dir}...")
    errors = validate(skill_dir)

    if errors:
        print(f"\n  FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"    - {e}")
        sys.exit(1)
    else:
        print("  PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
