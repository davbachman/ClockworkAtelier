from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

PLANETS = [
    ("mercury", 0, 0),
    ("venus", 1, 0),
    ("earth", 2, 0),
    ("mars", 0, 1),
    ("jupiter", 1, 1),
    ("saturn", 2, 1),
]

CELL_SIZE = 250
CANVAS_SIZE = 256
OUTPUT_COLOR = (235, 224, 198, 255)


def create_ink_alpha(image: Image.Image) -> Image.Image:
    grayscale = image.convert("L")
    return grayscale.point(
        lambda value: 0 if value >= 238 else min(255, int((238 - value) * 4.8))
    )


def create_circle_keep_mask() -> Image.Image:
    mask = Image.new("L", (CELL_SIZE, CELL_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((15, 8, 235, 220), fill=255)
    return mask


def create_saturn_keep_mask() -> Image.Image:
    mask = Image.new("L", (CELL_SIZE, CELL_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((34, 18, 214, 210), fill=255)

    ring_band = Image.new("L", (CELL_SIZE, CELL_SIZE), 0)
    ring_draw = ImageDraw.Draw(ring_band)

    # Preserve Saturn's full ring footprint from the source cell rather than
    # just a narrow outline, which clipped most of the visible ring lines.
    ring_draw.ellipse((-42, 56, 292, 180), fill=255)
    ring_draw.ellipse((18, 90, 232, 146), fill=0)
    rotated_band = ring_band.rotate(
        -24,
        resample=Image.Resampling.BICUBIC,
        center=(125, 118),
        fillcolor=0,
    )

    return ImageChops.lighter(mask, rotated_band)


def create_planet_asset(crop: Image.Image, keep_mask: Image.Image) -> Image.Image:
    alpha = ImageChops.multiply(create_ink_alpha(crop), keep_mask)
    tinted = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), OUTPUT_COLOR)
    tinted.putalpha(alpha)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(tinted, ((CANVAS_SIZE - CELL_SIZE) // 2, (CANVAS_SIZE - CELL_SIZE) // 2))
    return canvas


def create_isolated_asset(source: Image.Image, padding: int = 6) -> Image.Image:
    grayscale = source.convert("L")
    alpha = grayscale.point(
        lambda value: 0 if value >= 245 else min(255, int((245 - value) * 5.0))
    )

    tinted = Image.new("RGBA", source.size, OUTPUT_COLOR)
    tinted.putalpha(alpha)

    max_width = CANVAS_SIZE - padding
    max_height = CANVAS_SIZE - padding
    scale = min(max_width / source.width, max_height / source.height)
    resized = tinted.resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((CANVAS_SIZE - resized.width) // 2, (CANVAS_SIZE - resized.height) // 2),
    )
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--saturn-source", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGB")
    saturn_source = (
        Image.open(args.saturn_source).convert("RGB")
        if args.saturn_source
        else None
    )
    args.out_dir.mkdir(parents=True, exist_ok=True)

    preview = Image.new("RGBA", (CANVAS_SIZE * 3, CANVAS_SIZE * 2), (12, 16, 22, 255))

    for index, (name, column, row) in enumerate(PLANETS):
        crop = source.crop(
            (
                column * CELL_SIZE,
                row * CELL_SIZE,
                (column + 1) * CELL_SIZE,
                (row + 1) * CELL_SIZE,
            )
        )

        if name == "saturn" and saturn_source is not None:
            asset = create_isolated_asset(saturn_source)
        else:
            keep_mask = create_saturn_keep_mask() if name == "saturn" else create_circle_keep_mask()
            asset = create_planet_asset(crop, keep_mask)
        asset.save(args.out_dir / f"{name}.png")
        preview.alpha_composite(asset, ((index % 3) * CANVAS_SIZE, (index // 3) * CANVAS_SIZE))

    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        preview.save(args.preview)


if __name__ == "__main__":
    main()
