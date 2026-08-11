import qrcode
import os

def generate_qr():
    # URL to encode
    url = "https://card.shivamai.studio"
    
    # Configure QR code parameters
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    
    # Add data
    qr.add_data(url)
    qr.make(fit=True)
    
    # Create QR image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Ensure assets directory exists
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    # Save the image
    output_path = os.path.join(assets_dir, "card_qr_code.png")
    img.save(output_path)
    print(f"[SUCCESS] Generated QR code for '{url}' and saved to: {output_path}")

if __name__ == "__main__":
    generate_qr()
