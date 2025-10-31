import os
import re
import uuid
import pickle
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document

# 🔧 Environment Setup
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("❌ Missing OPENAI_API_KEY in .env file")

# Initialize embeddings
print("🔄 Loading OpenAI Embedding model (text-embedding-3-large)...")
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
    openai_api_key=OPENAI_API_KEY
)
print("✅ OpenAI embedding model loaded successfully!")


# 📂 Vector Store Paths

VECTOR_STORE_DIR = "./vector_db"
VECTOR_STORE_PATH = os.path.join(VECTOR_STORE_DIR, "faiss_index")
METADATA_PATH = os.path.join(VECTOR_STORE_DIR, "metadata.pkl")

# Global cache
_vectorstore = None
_documents_metadata = {}

# ⚙️ Load / Save Helpers
def _load_vectorstore():
    """Load existing FAISS store or create a new one."""
    global _vectorstore, _documents_metadata

    if _vectorstore is not None:
        return _vectorstore

    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    try:
        if os.path.exists(f"{VECTOR_STORE_PATH}.faiss") and os.path.exists(VECTOR_STORE_PATH):
            _vectorstore = FAISS.load_local(
                VECTOR_STORE_PATH, embeddings, allow_dangerous_deserialization=True
            )
            print("✅ Loaded existing FAISS vector store")
        else:
            _vectorstore = None
            print("📝 No existing FAISS vector store — will create new one")

        if os.path.exists(METADATA_PATH):
            with open(METADATA_PATH, "rb") as f:
                _documents_metadata = pickle.load(f)
            print(f"📋 Loaded metadata for {len(_documents_metadata)} document(s)")

        return _vectorstore

    except Exception as e:
        print(f"❌ Error loading vectorstore: {e}")
        _vectorstore = None
        return None


def _save_metadata():
    """Save all documents' metadata."""
    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    with open(METADATA_PATH, "wb") as f:
        pickle.dump(_documents_metadata, f)

# ➕ Add Document
def add_document_to_vectorstore(text: str, filename: str):
    """
    Add a document (PDF/Word/plain text) into FAISS vectorstore.
    Splits, embeds, and stores chunks with metadata.
    """
    global _vectorstore, _documents_metadata

    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks = splitter.split_text(text)
        if not chunks:
            raise ValueError("No text chunks generated. The file might be empty.")

        document_id = str(uuid.uuid4())
        print(f"📄 Adding document: {filename} ({len(chunks)} chunks)")

        documents = [
            Document(
                page_content=chunk,
                metadata={
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            )
            for i, chunk in enumerate(chunks)
        ]

        # Update metadata
        _documents_metadata[document_id] = {
            "filename": filename,
            "total_chunks": len(chunks),
        }
        _save_metadata()

        _load_vectorstore()

        if _vectorstore is None:
            _vectorstore = FAISS.from_documents(documents, embeddings)
            print("🆕 Created new FAISS vectorstore")
        else:
            _vectorstore.add_documents(documents)
            print("📚 Added new chunks to existing FAISS vectorstore")

        _vectorstore.save_local(VECTOR_STORE_PATH)
        print(f"✅ Stored {len(chunks)} chunks for '{filename}' (ID: {document_id})")

        return document_id

    except Exception as e:
        print(f"❌ Error adding document: {e}")
        import traceback; traceback.print_exc()
        raise

# 🔎 Hybrid Search
def _keyword_search(question: str, all_docs: list, top_k=5):
    """Keyword-based fallback search for exact or partial term matches."""
    question_lower = question.lower()
    keywords = re.findall(r'\b\w+\b', question_lower)
    scored = []

    for doc in all_docs:
        content = doc.page_content.lower()
        score = sum(1 for kw in keywords if kw in content)
        if score > 0:
            scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored[:top_k]]


def query_vectorstore(question: str, document_id: str | None = None):
    """
    Perform hybrid (semantic + keyword) search.
    Returns top relevant chunks for analysis.
    """
    try:
        _load_vectorstore()
        if _vectorstore is None:
            print("⚠️ No documents in vector store.")
            return []

        all_docs = list(_vectorstore.docstore._dict.values())

        if document_id:
            all_docs = [d for d in all_docs if d.metadata.get("document_id") == document_id]

        # 1️⃣ Semantic
        semantic_results = _vectorstore.similarity_search(question, k=10)
        if document_id:
            semantic_results = [r for r in semantic_results if r.metadata.get("document_id") == document_id]

        # 2️⃣ Keyword
        keyword_results = _keyword_search(question, all_docs, top_k=5)

        # 3️⃣ Combine & deduplicate
        seen = set()
        combined = []

        for doc in keyword_results + semantic_results:
            key = (doc.page_content, doc.metadata.get("document_id"))
            if key not in seen:
                combined.append(doc)
                seen.add(key)

        results = combined[:5]

        if results:
            print(f"\n🔍 Top match: {results[0].metadata.get('filename')}")
            print(f"   Preview: {results[0].page_content[:100]}...\n")
        else:
            print("⚠️ No matching chunks found.")

        return results

    except Exception as e:
        print(f"❌ Query error: {e}")
        import traceback; traceback.print_exc()
        return []


# 📋 List, Delete, Metadata
def list_all_documents():
    """List all indexed documents."""
    _load_vectorstore()
    print("\n📚 Documents in vectorstore:")
    for doc_id, meta in _documents_metadata.items():
        print(f"- {meta['filename']} ({doc_id[:8]}) — {meta['total_chunks']} chunks")
    print()
    return _documents_metadata


def delete_document_from_vectorstore(document_id: str):
    """Delete a document and its vectors by document_id."""
    global _vectorstore, _documents_metadata
    _load_vectorstore()

    if _vectorstore is None:
        print("⚠️ Vector store is empty.")
        return False

    try:
        remaining = [
            d for d in _vectorstore.docstore._dict.values()
            if d.metadata.get("document_id") != document_id
        ]

        if len(remaining) == len(_vectorstore.docstore._dict):
            print(f"⚠️ No entries found for document ID {document_id}")
            return False

        new_store = FAISS.from_documents(remaining, embeddings)
        new_store.save_local(VECTOR_STORE_PATH)
        _vectorstore = new_store

        if document_id in _documents_metadata:
            del _documents_metadata[document_id]
            _save_metadata()

        print(f"✅ Deleted document {document_id} from vectorstore.")
        return True

    except Exception as e:
        print(f"❌ Failed to delete document: {e}")
        import traceback; traceback.print_exc()
        return False


def get_document_metadata(document_id: str):
    """Get metadata for one document."""
    return _documents_metadata.get(document_id)


def get_all_documents_metadata():
    """Return metadata for all documents."""
    _load_vectorstore()
    return _documents_metadata
