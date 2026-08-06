from PIL import Image, ImageDraw

def main():
    im = Image.open('app-icon.jpg').convert('RGBA')
    
    # We want to replace the white background in the corners with transparent pixels.
    # The image has a dark rounded box in the center, and white everywhere outside.
    
    width, height = im.size
    pixels = im.load()
    
    # Simple thresholding: if a pixel is very bright and mostly white, make it transparent.
    # We can use a flood fill from the corners to be safe.
    
    def flood_fill(x, y):
        # basic stack-based flood fill
        stack = [(x, y)]
        while stack:
            cx, cy = stack.pop()
            if cx < 0 or cx >= width or cy < 0 or cy >= height:
                continue
            r, g, b, a = pixels[cx, cy]
            if a == 0:
                continue
            # If the pixel is roughly white (e.g., >200 in all channels)
            if r > 200 and g > 200 and b > 200:
                pixels[cx, cy] = (0, 0, 0, 0)
                stack.extend([(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)])
                
    # Flood fill from the 4 corners
    flood_fill(0, 0)
    flood_fill(width - 1, 0)
    flood_fill(0, height - 1)
    flood_fill(width - 1, height - 1)
    
    im.save('app-icon.png')
    print("Done removing white background.")

if __name__ == '__main__':
    main()
