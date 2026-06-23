import pytesseract
from PIL import Image
import io
import os

# Windows path to tesseract.exe
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def extract_text_from_image(file_bytes: bytes) -> str:
    """
    Takes raw image bytes (jpg/png) and returns extracted text.
    """
    try:
        image = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        return f"OCR_ERROR: {str(e)}"


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    PyMuPDF se directly text extract karta hai — no poppler needed.
    """
    try:
        import fitz  # pymupdf
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        full_text = []
        for page in doc:
            full_text.append(page.get_text())
        text = "\n".join(full_text).strip()
        if not text:
            return "OCR_ERROR: No text found in PDF"
        return text
    except Exception as e:
        return f"OCR_ERROR: {str(e)}"


def extract_text(file_bytes: bytes, content_type: str) -> str:
    """
    Main entry point — routes to image or PDF extraction based on content type.
    """
    if content_type == "application/pdf":
        return extract_text_from_pdf(file_bytes)
    elif content_type in ("image/jpeg", "image/png", "image/jpg"):
        return extract_text_from_image(file_bytes)
    else:
        return "OCR_ERROR: Unsupported file type"