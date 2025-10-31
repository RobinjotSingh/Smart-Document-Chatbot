from flask import Blueprint, request, jsonify
import os
import sys
from werkzeug.utils import secure_filename
import io
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import numpy as np
from docx import Document

# Import services
from services.pdf_service import extract_text_from_pdf
from services.vector_store import add_document_to_vectorstore, delete_document_from_vectorstore

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 🔧 Configure Tesseract path for Windows (adjust if needed)
pytesseract.pytesseract.tesseract_cmd = r'C:\Users\robin\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'

upload_bp = Blueprint('upload', __name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# 📁 File Validation
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS



# 🧠 OCR Image Preprocessing

def preprocess_image_for_ocr(image):
    """Enhance image for better OCR accuracy."""
    try:
        from PIL import ImageEnhance
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.5)
        return image
    except Exception as e:
        print(f"⚠️ Image preprocessing failed: {e}")
        return image


# 🔍 OCR Extraction (for scanned PDFs or images)

def extract_text_with_ocr(input_path):
    """Extract text from images or scanned PDFs using Tesseract."""
    text_output = ""

    # --- Image file (JPG, PNG, etc.)
    if input_path.lower().endswith(('.png', '.jpg', '.jpeg')):
        print(f"🧠 Running OCR on image: {input_path}")
        try:
            image = Image.open(input_path)
            image = preprocess_image_for_ocr(image)
            text_output = pytesseract.image_to_string(image, lang="eng", config='--oem 3 --psm 6')
            print(f"✅ OCR extracted {len(text_output)} characters from image")
        except Exception as e:
            print(f"❌ OCR failed on image: {e}")
        return text_output.strip()

    # --- PDF file
    try:
        pdf_document = fitz.open(input_path)
        total_pages = len(pdf_document)
        print(f"📄 Performing OCR on {total_pages} pages...")
        for i in range(total_pages):
            page = pdf_document.load_page(i)
            mat = fitz.Matrix(300 / 72, 300 / 72)
            pix = page.get_pixmap(matrix=mat)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            img = preprocess_image_for_ocr(img)
            page_text = pytesseract.image_to_string(img, lang="eng", config='--oem 3 --psm 6')
            text_output += f"\n\n--- Page {i+1} ---\n{page_text.strip()}"
        pdf_document.close()
        print(f"✅ OCR completed: {len(text_output)} characters extracted.")
    except Exception as e:
        print(f"❌ OCR extraction failed: {e}")

    return text_output.strip()


# 📘 Word Document Text Extraction

def extract_text_from_docx(docx_path):
    """Extract text from Word (.docx) files."""
    try:
        print(f"📘 Extracting text from Word: {docx_path}")
        doc = Document(docx_path)
        text = "\n".join([p.text.strip() for p in doc.paragraphs if p.text.strip()])
        print(f"✅ Extracted {len(text)} characters from DOCX")
        return text
    except Exception as e:
        print(f"❌ DOCX extraction failed: {e}")
        return ""


# 📄 TXT File Extraction

def extract_text_from_txt(txt_path):
    """Extract text from plain text files."""
    try:
        print(f"📄 Reading TXT file: {txt_path}")
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read().strip()
        print(f"✅ Extracted {len(text)} characters from TXT")
        return text
    except Exception as e:
        print(f"❌ TXT extraction failed: {e}")
        return ""


# 🧩 Detect Scanned PDF
def check_if_scanned_pdf(pdf_path):
    """Detect if PDF is scanned (no text layer)."""
    try:
        pdf = fitz.open(pdf_path)
        total_text = sum(len(pdf.load_page(i).get_text().strip()) for i in range(min(3, len(pdf))))
        pdf.close()
        return total_text < 100
    except Exception:
        return False


# 📤 Universal Upload Endpoint
@upload_bp.route('', methods=['POST', 'OPTIONS'])
@upload_bp.route('/', methods=['POST', 'OPTIONS'])
def upload_file():
    """Handle uploads for PDF, DOCX, TXT, and image files with OCR support."""
    filepath = None
    try:
        if request.method == 'OPTIONS':
            return jsonify({'ok': True}), 200

        file = request.files.get('file')
        if not file or file.filename == '':
            return jsonify({'error': 'No file uploaded'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        print(f"\n{'='*60}")
        print(f"📂 Received file: {filename}")
        print(f"   Path: {filepath}")
        print(f"   Size: {os.path.getsize(filepath) / 1024:.2f} KB")
        print(f"{'='*60}\n")

        file_ext = filename.rsplit('.', 1)[1].lower()
        extracted_text = ""

        # --- Route based on file type ---
        if file_ext == 'pdf':
            if check_if_scanned_pdf(filepath):
                print("🔍 Scanned PDF detected. Using OCR...")
                extracted_text = extract_text_with_ocr(filepath)
            else:
                extracted_text = extract_text_from_pdf(filepath)
                if not extracted_text.strip():
                    print("⚠️ Fallback to OCR (empty PDF text)...")
                    extracted_text = extract_text_with_ocr(filepath)

        elif file_ext == 'docx':
            extracted_text = extract_text_from_docx(filepath)

        elif file_ext == 'txt':
            extracted_text = extract_text_from_txt(filepath)

        elif file_ext in ['png', 'jpg', 'jpeg']:
            extracted_text = extract_text_with_ocr(filepath)

        else:
            return jsonify({'error': 'Unsupported file type'}), 400

        # --- Validation ---
        if not extracted_text or len(extracted_text.strip()) < 10:
            os.remove(filepath)
            return jsonify({'error': 'No readable text extracted. File may be empty or image-only.', 'success': False}), 400

        print(f"✅ Final extracted length: {len(extracted_text)} characters")

        # --- Store in vector DB ---
        document_id = add_document_to_vectorstore(extracted_text, filename)
        print(f"📦 Stored to vector store: {document_id}")

        return jsonify({
            'success': True,
            'message': 'File uploaded and processed successfully',
            'document_id': document_id,
            'filename': filename,
            'textLength': len(extracted_text),
            'ocrUsed': file_ext in ['png', 'jpg', 'jpeg']
        }), 200

    except Exception as e:
        print(f"❌ UPLOAD ERROR: {e}")
        import traceback; traceback.print_exc()
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e), 'success': False}), 500


# 🗑️ DELETE ENDPOINT
@upload_bp.route('/<document_id>', methods=['DELETE'])
def delete_file(document_id):
    """Delete a document from vector store and uploads folder."""
    try:
        delete_document_from_vectorstore(document_id)
        removed_files = []
        for file in os.listdir(UPLOAD_FOLDER):
            if document_id in file:
                os.remove(os.path.join(UPLOAD_FOLDER, file))
                removed_files.append(file)
        return jsonify({'success': True, 'removed_files': removed_files}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
