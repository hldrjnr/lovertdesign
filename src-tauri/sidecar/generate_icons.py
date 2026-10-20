from PIL import Image
import os

os.makedirs("src-tauri/icons", exist_ok=True)
img = Image.open("icon.png")

img.resize((256, 256), Image.LANCZOS).save("src-tauri/icons/32x32.png")
img.resize((128, 128), Image.LANCZOS).save("src-tauri/icons/128x128.png")
img.resize((256, 256), Image.LANCZOS).save("src-tauri/icons/128x128@2x.png")
img.resize((256, 256), Image.LANCZOS).save("src-tauri/icons/icon.png")

ico = Image.new("RGBA", (256, 256))
ico.paste(img.resize((256, 256), Image.LANCZOS))
ico.save("src-tauri/icons/icon.ico", format="ICO", sizes=[(128, 128), (256, 256)])

print("Icones gerados")
