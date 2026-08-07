import os
from PIL import Image

def remove_white_background(img_path):
    try:
        img = Image.open(img_path).convert("RGBA")
        data = img.getdata()
        
        new_data = []
        for item in data:
            r, g, b, a = item
            # White or near-white
            if r > 230 and g > 230 and b > 230:
                # Make transparent
                new_data.append((255, 255, 255, 0))
            else:
                # Optionally, for anti-aliasing, we could blend, but let's try simple threshold first
                new_data.append(item)
                
        img.putdata(new_data)
        return img
    except Exception as e:
        print(f"Failed to process {img_path}: {e}")
        return None

icon_dir = r"C:\Users\thorb\Documents\antigravity\CaeserClient\src-tauri\icons"
png_files = [f for f in os.listdir(icon_dir) if f.endswith(".png")]

for filename in png_files:
    path = os.path.join(icon_dir, filename)
    img = remove_white_background(path)
    if img:
        img.save(path, "PNG")
        print(f"Processed {filename}")

# Also update icon.ico and icon.icns if possible (or just recreate icon.ico from a large png)
large_png_path = os.path.join(icon_dir, "icon.png")
if os.path.exists(large_png_path):
    img = Image.open(large_png_path)
    ico_path = os.path.join(icon_dir, "icon.ico")
    # Save as ico, supplying multiple sizes
    sizes = [(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=sizes)
    print("Recreated icon.ico")
