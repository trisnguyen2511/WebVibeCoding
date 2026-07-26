#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Raster image generation via the Agnes AI API (apihub.agnes-ai.com).
Free alternative to ai-multimodal's Gemini image generation for banner
backgrounds/visuals. OpenAI-compatible images/generations endpoint.

Usage:
    python3 agnes-generate.py --prompt "abstract gradient background, no text" \
        --size 1024x1024 --output assets/banners/campaign/bg.png
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path


def load_env():
    env_paths = [
        Path(__file__).parent.parent.parent / ".env",
        Path.home() / ".claude" / "skills" / ".env",
        Path.home() / ".claude" / ".env",
    ]
    for env_path in env_paths:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        if key not in os.environ:
                            os.environ[key] = value.strip("\"'")


load_env()

AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/images/generations"
VALID_MODELS = ("agnes-image-2.0-flash", "agnes-image-2.1-flash")


def generate_image(prompt, model="agnes-image-2.0-flash", size="1024x1024", output_path=None):
    api_key = os.environ.get("AGNES_AI_API_KEY")
    if not api_key:
        print("Error: AGNES_AI_API_KEY not set")
        print("Set it with: export AGNES_AI_API_KEY='your-key'")
        return None

    payload = json.dumps({"model": model, "prompt": prompt, "n": 1, "size": size}).encode("utf-8")
    req = urllib.request.Request(
        AGNES_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
    except Exception as e:
        print(f"Error calling Agnes AI: {e}")
        return None

    image = (data.get("data") or [{}])[0]
    url = image.get("url")
    b64 = image.get("b64_json")

    if not url and not b64:
        print("Agnes AI returned no image")
        return None

    if output_path is None:
        output_path = "agnes-image.png"
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if b64:
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(b64))
    else:
        urllib.request.urlretrieve(url, output_path)

    print(f"Image saved to: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate a raster image via the Agnes AI API")
    parser.add_argument("--prompt", "-p", required=True, help="Image prompt")
    parser.add_argument("--model", "-m", choices=VALID_MODELS, default="agnes-image-2.0-flash")
    parser.add_argument("--size", "-s", default="1024x1024", help="e.g. 1024x1024, 1024x1792, 1792x1024")
    parser.add_argument("--output", "-o", required=True, help="Output PNG path")
    args = parser.parse_args()

    result = generate_image(args.prompt, args.model, args.size, args.output)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
