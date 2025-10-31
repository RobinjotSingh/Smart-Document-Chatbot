import PyPDF2
import os

def extract_text_from_pdf(filepath):
    """
    Extract text content from a PDF file.
    
    Args:
        filepath (str): Path to the PDF file
        
    Returns:
        str: Extracted text content
        
    Raises:
        Exception: If PDF extraction fails
    """
    try:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"PDF file not found: {filepath}")
        
        text = ""
        
        with open(filepath, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            num_pages = len(pdf_reader.pages)
            
            print(f"📖 Reading PDF: {num_pages} page(s)")
            
            for page_num in range(num_pages):
                try:
                    page = pdf_reader.pages[page_num]
                    page_text = page.extract_text()
                    
                    if page_text:
                        text += page_text + "\n\n"
                        print(f"   ✓ Page {page_num + 1}: {len(page_text)} chars")
                    else:
                        print(f"   ⚠ Page {page_num + 1}: No text found")
                        
                except Exception as page_error:
                    print(f"   ❌ Error on page {page_num + 1}: {str(page_error)}")
                    continue
        
        text = text.strip()
        
        if not text:
            raise ValueError("No text could be extracted from the PDF. The file may contain only images or be corrupted.")
        
        print(f"✅ Total extracted: {len(text)} characters")
        
        return text
        
    except PyPDF2.errors.PdfReadError as e:
        raise Exception(f"Invalid or corrupted PDF file: {str(e)}")
    except Exception as e:
        raise Exception(f"Error extracting text from PDF: {str(e)}")


def validate_pdf(filepath):
    """
    Validate if a file is a readable PDF.
    
    Args:
        filepath (str): Path to the file
        
    Returns:
        tuple: (is_valid, error_message)
    """
    try:
        with open(filepath, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            # Check if we can read the number of pages
            num_pages = len(pdf_reader.pages)
            
            if num_pages == 0:
                return False, "PDF has no pages"
            
            # Try to read first page
            first_page = pdf_reader.pages[0]
            first_page.extract_text()
            
            return True, None
            
    except Exception as e:
        return False, str(e)