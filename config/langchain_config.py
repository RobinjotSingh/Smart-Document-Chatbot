import os
import re
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("❌ Missing OPENAI_API_KEY in .env file")

client = OpenAI(api_key=OPENAI_API_KEY)

# Model configuration
MODEL_NAME = os.getenv("CHAT_MODEL", "gpt-4o-mini")
TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "0.1"))


# Helper: Prepare Document Context

def build_context_from_chunks(relevant_chunks, limit=15000):
    """
    Combine text chunks into a formatted context block.
    Truncate if too long to prevent token overflow.
    """
    if not relevant_chunks:
        return ""

    context_parts = []
    for i, chunk in enumerate(relevant_chunks, 1):
        filename = chunk.metadata.get("filename", "Unknown")
        content = chunk.page_content.strip()
        if not content:
            continue
        context_parts.append(f"--- Section {i} (from {filename}) ---\n{content}")

    context = "\n\n".join(context_parts).strip()

    if len(context) > limit:
        context = context[:limit] + "\n\n[Context truncated for length.]"

    return context



# Helper: Post-process & Table Formatting
def remove_second_row_from_all_tables(text: str) -> str:
    """
    Detects Markdown tables and removes ONLY the separator row (second row with dashes).
    Does NOT remove rows that contain actual data.
    """
    lines = text.splitlines()
    cleaned_lines = []
    buffer = []
    inside_table = False

    for line in lines:
        # Detect start or continuation of a table
        if "|" in line or re.search(r'\S+\s{2,}\S+', line):
            inside_table = True
            buffer.append(line)
        else:
            # End of table detected
            if inside_table:
                if len(buffer) > 1:
                    # Only remove second row if it's a Markdown separator (only dashes/pipes/colons/spaces)
                    second_row = buffer[1]
                    if re.match(r'^[\s\|\-:]+$', second_row):
                        buffer.pop(1)
                cleaned_lines.extend(buffer)
                buffer = []
                inside_table = False
            cleaned_lines.append(line)

    # Handle case where text ends with a table
    if inside_table:
        if len(buffer) > 1:
            second_row = buffer[1]
            if re.match(r'^[\s\|\-:]+$', second_row):
                buffer.pop(1)
        cleaned_lines.extend(buffer)

    return "\n".join(cleaned_lines)


def clean_and_format_answer(answer: str) -> str:
    """
    Post-process the answer text.
    Clean up formatting and apply table processing.
    """
    answer = answer.strip()
    answer = remove_second_row_from_all_tables(answer)
    return answer


# Streaming Answer Function
def generate_answer_stream(user_input, relevant_chunks):
    """
    True streaming response with live token output.
    - Removes Markdown separator rows (|---|---| or dashed lines).
    - Uses tables only for multi-row structured data.
    - Uses direct text with heading for single answers.
    """
    try:
        context = build_context_from_chunks(relevant_chunks)
        if not context:
            yield "⚠️ No information available."
            return

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a **professional, context-aware document analysis assistant**.\n"
                    "Your task is to read, understand, and extract precise information from the provided document text.\n"
                    "You must always respond **strictly based on document content**.\n\n"
                    "### Core Rules:\n"
                    "1. Never guess, assume, or infer beyond the document.\n"
                    "   If the answer is missing, reply exactly: ⚠️ No information available.\n"
                    "2. Be **concise**, **factual**, and **neutral** — no greetings, filler, or opinions.\n"
                    "3. Maintain **professional formatting** that fits the complexity of the data.\n\n"
                    "### Formatting Logic:\n"
                    "- **Heading** have a simple heading dynamically created even for single answer\n"
                    "- **Single answer:** Use → `**Field:** Value`\n"
                    "  Example →** Nama Peminjam:** ROBINJOT SINGH A/L SARBAN SINGH\n\n"
                    "- **Multiple related details:** Use a clean, Markdown table.\n"
                    "  Example:\n"
                    "  | Borrower Name | John Doe |\n"
                    "  | Identity Number | 041011101685 |\n\n"
                    "- **Lists (multiple entries or items):** Use bullet points.\n"
                    "  Example:\n"
                    "  ◉ Surat Tawaran\n"
                    "  ◉ Dokumen Perjanjian\n"
                    "  ◉ Salinan Kad Pengenalan\n\n"
                    "- **Hierarchical info (sections/subsections):** Use headings.\n"
                    "  Example:\n"
                    "  **Perjanjian Pinjaman**\n"
                    "  | Tarikh | 10 Oktober 2025 |\n"
                    "  | Jumlah Pinjaman | RM10,000 |\n\n"
                    "- **Dates, amounts, and IDs** must match document exactly.\n"
                    "- Do **not** add Markdown separator rows (|---|---|).\n"
                    "- Do **not** include any explanations — only clean extracted data.\n"
                ),
            },
            {
                "role": "user",
                "content": f"""QUESTION:
{user_input}

DOCUMENT CONTEXT:
{context}

INSTRUCTIONS:
1. Use only the document context.
2. Use bullet points for multiple facts or steps.
3. Use tables ONLY for structured multi-item data.
4. Use direct 'Field: Value' format for one-line answers.
5. DO NOT include separator rows with dashes (|---|---|).
6. Keep concise, factual, and direct.

FINAL ANSWER:""",
            },
        ]

        # Start OpenAI stream
        stream = client.chat.completions.create(
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            messages=messages,
            max_tokens=600,
            stream=True,
        )
 
        print(f"✅ True streaming answer using {MODEL_NAME}")

        buffer = ""
        for chunk in stream:
            delta = chunk.choices[0].delta
            if not delta or not delta.content:
                continue

            token = delta.content
            buffer += token

            # Skip markdown separator or dashed lines live
            if re.match(r'^\s*\|?\s*[-: ]+\s*(\|\s*[-: ]+\s*)*\|?\s*$', token.strip()):
                continue  # don't yield separator rows

            yield token

        # Clean up final buffer internally (optional)
        remove_second_row_from_all_tables(buffer)

    except Exception as e:
        print(f"❌ Error generating streaming answer: {e}")
        import traceback
        traceback.print_exc()
        yield f"\n\n❌ Error: {str(e)}"
