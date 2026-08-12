import qrcode
import os

def generate_qr():
    targets = [
        {
            "name": "Company Production WebAR QR",
            "url": "https://ar.testsjit.in",
            "filenames": ["qr/company_qr_code.png"]
        },
        {
            "name": "Personal / Development WebAR QR",
            "url": "https://card.shivamai.studio",
            "filenames": ["qr/parth_qr_code.png"]
        }
    ]
    
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
    os.makedirs(os.path.join(assets_dir, "qr"), exist_ok=True)
    
    for item in targets:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=5,  # White border margin (quiet zone)
        )
        qr.add_data(item["url"])
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        for filename in item["filenames"]:
            output_path = os.path.join(assets_dir, filename)
            img.save(output_path)
            print(f"[SUCCESS] Generated QR code for '{item['url']}' -> {output_path}")

if __name__ == "__main__":
    generate_qr()


