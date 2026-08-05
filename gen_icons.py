"""Generate TraceTrust extension icons."""
import struct, zlib

def create_png(size, filename):
    """Create a simple circular checkmark icon PNG."""

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    # RGBA pixel data
    pixels = []
    cx = size // 2
    cy = size // 2
    r = size // 2 - max(1, size // 16)
    stroke = max(1, size // 16)

    for y in range(size):
        row = []
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            # Circle ring
            in_ring = r - stroke <= dist <= r + stroke

            # Checkmark
            check_scale = r * 0.55
            check_cx = cx - r * 0.15
            check_cy = cy + r * 0.1

            # Transform to checkmark coordinates
            px = (x - check_cx) / check_scale
            py = (y - check_cy) / check_scale

            on_check = False
            # Left part: from (-0.55, 0.05) to (0, 0.55)
            if -0.55 <= px <= 0.05:
                expected_y = 0.05 + (px + 0.55) * (0.55 - 0.05) / (0.05 + 0.55)
                if abs(py - expected_y) < (stroke * 1.8 / check_scale):
                    on_check = True
            # Right part: from (0, 0.55) to (0.65, -0.15)
            if 0 <= px <= 0.65:
                expected_y = 0.55 + px * (-0.15 - 0.55) / 0.65
                if abs(py - expected_y) < (stroke * 1.8 / check_scale):
                    on_check = True

            if in_ring or on_check:
                # Indigo color #4f46e5
                row.extend([79, 70, 229, 255])
            else:
                row.extend([0, 0, 0, 0])
        pixels.append(bytes(row))

    raw = b''.join(pixels)

    # Build PNG
    png = b'\x89PNG\r\n\x1a\n'
    png += make_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))

    # Filtered scanlines
    filtered = b''
    for y in range(size):
        filtered += b'\x00' + raw[y * size * 4:(y + 1) * size * 4]
    png += make_chunk(b'IDAT', zlib.compress(filtered))
    png += make_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png)
    print(f'  Created {filename} ({size}x{size})')

if __name__ == '__main__':
    create_png(16, 'icons/icon16.png')
    create_png(48, 'icons/icon48.png')
    create_png(128, 'icons/icon128.png')
    print('Done.')
