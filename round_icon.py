from PIL import Image, ImageDraw

def create_rounded_mask(size, radius):
    # Create a mask with the given size and rounded corners
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask

def main():
    im = Image.open('app-icon.jpg').convert('RGBA')
    
    # The image is 1024x1024, the white corners are quite large.
    # We can try to dynamically find the bounding box of the non-white area,
    # or just use a fixed rounded rectangle mask that fits perfectly.
    
    width, height = im.size
    pixels = im.load()
    
    # Let's find the bounding box of the dark area (not white)
    min_x, max_x = width, 0
    min_y, max_y = height, 0
    
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            # Consider anything not bright white as part of the logo
            if r < 240 or g < 240 or b < 240:
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
                
    # Crop to the actual logo bounds
    # Add a small margin just in case
    margin = 2
    min_x = max(0, min_x + margin)
    max_x = min(width - 1, max_x - margin)
    min_y = max(0, min_y + margin)
    max_y = min(height - 1, max_y - margin)
    
    # The dark box is the area between min_x, max_x, min_y, max_y
    # To get perfectly smooth corners, we apply a mathematical rounded mask
    # We can estimate the radius by looking at how far the corner is from the bounding box corner.
    # Alternatively, just use a radius of about 15% of the width.
    box_width = max_x - min_x
    radius = int(box_width * 0.22) # Adjust this if needed, 22% is typical for iOS-like icons
    
    # Crop the image to the box
    cropped = im.crop((min_x, min_y, max_x, max_y))
    
    # Apply rounded mask
    mask = create_rounded_mask(cropped.size, radius)
    cropped.putalpha(mask)
    
    # We will pad it back to square just in case, but Tauri handles non-square or tightly cropped icons fine.
    # Actually, a square is better for an icon.
    size = max(cropped.width, cropped.height)
    final_im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = ((size - cropped.width) // 2, (size - cropped.height) // 2)
    final_im.paste(cropped, offset, mask)
    
    final_im.save('app-icon.png')
    print(f"Done. Bounds: {min_x},{min_y} to {max_x},{max_y}. Radius: {radius}")

if __name__ == '__main__':
    main()
