from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

CANVAS_SIZE = 256
OUTPUT_COLOR = (235, 224, 198, 255)


def fit_to_canvas(image: Image.Image, padding: int) -> Image.Image:
    max_width = CANVAS_SIZE - padding
    max_height = CANVAS_SIZE - padding
    scale = min(max_width / image.width, max_height / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((CANVAS_SIZE - resized.width) // 2, (CANVAS_SIZE - resized.height) // 2),
    )
    return canvas


def create_art_asset(source: Image.Image) -> Image.Image:
    grayscale = source.convert("L")
    alpha = grayscale.point(
        lambda value: 0 if value >= 245 else min(255, int((245 - value) * 5.2))
    )

    tinted = Image.new("RGBA", source.size, OUTPUT_COLOR)
    tinted.putalpha(alpha)
    return fit_to_canvas(tinted, padding=6)


def create_occluder_asset(source: Image.Image) -> Image.Image:
    grayscale = source.convert("L")
    alpha = grayscale.point(lambda value: 0 if value >= 251 else 255)
    disc_mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(disc_mask)
    disc_radius = min(source.size) * 0.392
    center_x = source.width / 2
    center_y = source.height / 2
    draw.ellipse(
        (
            center_x - disc_radius,
            center_y - disc_radius,
            center_x + disc_radius,
            center_y + disc_radius,
        ),
        fill=255,
    )
    alpha = ImageChops.subtract(alpha, disc_mask)
    alpha = alpha.filter(ImageFilter.MaxFilter(5))

    tinted = Image.new("RGBA", source.size, OUTPUT_COLOR)
    tinted.putalpha(alpha)
    return fit_to_canvas(tinted, padding=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out-art", type=Path, required=True)
    parser.add_argument("--out-occluder", type=Path, required=True)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGB")
    art = create_art_asset(source)
    occluder = create_occluder_asset(source)

    args.out_art.parent.mkdir(parents=True, exist_ok=True)
    args.out_occluder.parent.mkdir(parents=True, exist_ok=True)
    art.save(args.out_art)
    occluder.save(args.out_occluder)

    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        preview = Image.new("RGBA", (CANVAS_SIZE * 2, CANVAS_SIZE), (12, 16, 22, 255))
        preview.alpha_composite(occluder, (0, 0))
        preview.alpha_composite(art, (CANVAS_SIZE, 0))
        preview.save(args.preview)


if __name__ == "__main__":
    main()
