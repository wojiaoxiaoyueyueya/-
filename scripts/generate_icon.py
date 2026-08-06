from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SIZE = 512

image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

# Soft, layered shadow.
for spread, alpha in ((24, 10), (16, 16), (8, 24)):
    draw.rounded_rectangle((70-spread, 52-spread//2, 442+spread, 442+spread), radius=92+spread, fill=(96, 61, 19, alpha))

# Warm sticky-note body and folded corner.
draw.rounded_rectangle((70, 52, 442, 442), radius=92, fill=(244, 169, 55, 255))
draw.polygon([(335, 52), (354, 52), (442, 140), (442, 164), (365, 164), (335, 134)], fill=(255, 226, 163, 255))

# Check and writing lines.
draw.line([(144, 204), (187, 247), (270, 159)], fill=(255, 255, 255, 255), width=30, joint="curve")
draw.line([(147, 317), (365, 317)], fill=(255, 255, 255, 235), width=22)
draw.line([(147, 365), (309, 365)], fill=(255, 255, 255, 235), width=22)

png_path = ASSETS / "icon.png"
ico_path = ASSETS / "icon.ico"
image.save(png_path, "PNG")
image.save(ico_path, "ICO", sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)])
print(png_path)
print(ico_path)
