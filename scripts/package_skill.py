#!/usr/bin/env python3
"""Package a skill folder into a .skill file (ZIP archive)."""

import hashlib
import os
import sys
import zipfile


EXCLUDE_DIRS = {"evals", "__pycache__", ".git"}
EXCLUDE_FILES = {".DS_Store"}


def package(skill_dir: str, output_dir: str = "dist") -> str:
    """Package a skill into a .skill ZIP file. Returns the output path."""
    skill_name = os.path.basename(os.path.normpath(skill_dir))
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{skill_name}.skill")

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(skill_dir):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for filename in files:
                if filename in EXCLUDE_FILES:
                    continue
                filepath = os.path.join(root, filename)
                arcname = os.path.relpath(filepath, skill_dir)
                zf.write(filepath, arcname)

    # Compute SHA-256
    sha256 = hashlib.sha256()
    with open(output_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)

    checksum = sha256.hexdigest()
    print(f"Packaged: {output_path}")
    print(f"SHA-256:  {checksum}")
    return output_path


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <skill-directory> [output-directory]")
        sys.exit(1)

    skill_dir = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "dist"

    if not os.path.isdir(skill_dir):
        print(f"Error: '{skill_dir}' is not a directory")
        sys.exit(1)

    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        print(f"Error: SKILL.md not found in '{skill_dir}'")
        sys.exit(1)

    package(skill_dir, output_dir)


if __name__ == "__main__":
    main()
