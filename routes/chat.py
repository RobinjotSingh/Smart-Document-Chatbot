from flask import Blueprint, request, jsonify, Response, stream_with_context
from services.vector_store import query_vectorstore, get_all_documents_metadata
from config.langchain_config import generate_answer_stream
from services.chat_memory import get_chat_history, append_to_history, clear_chat_history
import json

chat_bp = Blueprint('chat', __name__)

# Accept both '/api/chat' and '/api/chat/' and handle OPTIONS preflight
@chat_bp.route('', methods=['POST', 'OPTIONS'])
@chat_bp.route('/', methods=['POST', 'OPTIONS'])
def chat():
    """Handle chat queries with streaming and short-term memory"""
    try:
        # --- Handle preflight CORS requests ---
        if request.method == 'OPTIONS':
            return jsonify({'ok': True}), 200

        # --- Parse request JSON ---
        data = request.get_json(silent=True)
        if not data or 'question' not in data:
            return jsonify({'error': 'No question provided'}), 400

        question = data.get('question', '').strip()
        document_id = data.get('document_id') or data.get('doc_id')
        session_id = data.get('session_id', 'default')

        if not question:
            return jsonify({'error': 'Question cannot be empty'}), 400

        print(f"\n{'='*60}")
        print(f"💬 Session ID: {session_id}")
        print(f"💬 User Question: {question}")
        if document_id:
            print(f"📄 Document filter: {document_id}")
        print(f"{'='*60}")

        # --- Retrieve previous short-term memory ---
        chat_history = get_chat_history(session_id)

        # --- Build conversation context from last few turns ---
        conversation_context = ""
        for msg in chat_history[-5:]:
            conversation_context += f"\n{msg['role'].upper()}: {msg['content']}"

        # --- Combine chat memory + current question ---
        combined_input = (
            f"Conversation so far:\n{conversation_context}\n\n"
            f"User's new question:\n{question}"
        )

        # --- Query your vector store for relevant document chunks ---
        relevant_chunks = query_vectorstore(question, document_id)
        if not relevant_chunks:
            return jsonify({
                'answer': 'No relevant information found in the uploaded documents. Please make sure you have uploaded a document first.',
                'sources': []
            }), 200

        # --- Prepare source info ---
        sources = []
        seen_docs = set()
        for chunk in relevant_chunks:
            doc_id = chunk.metadata.get('document_id')
            if doc_id not in seen_docs:
                seen_docs.add(doc_id)
                sources.append({
                    'document_id': doc_id,
                    'filename': chunk.metadata.get('filename', 'Unknown'),
                    'chunk_index': chunk.metadata.get('chunk_index', 0)
                })

        # --- Stream the response ---
        def generate():
            full_answer = ""
            
            # Send sources first
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
            
            # Stream the answer token by token
            for token in generate_answer_stream(combined_input, relevant_chunks):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            
            # Send completion signal
            yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
            
            # --- Update short-term memory after streaming completes ---
            append_to_history(session_id, "user", question)
            append_to_history(session_id, "assistant", full_answer)

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        print(f"❌ Chat error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# 🧹 Optional endpoint: clear chat memory manually
@chat_bp.route('/clear', methods=['POST'])
def clear_memory():
    """Clear short-term memory for a given session"""
    try:
        data = request.get_json(silent=True)
        session_id = data.get('session_id', 'default')
        clear_chat_history(session_id)
        return jsonify({'message': f'Memory cleared for session: {session_id}'}), 200
    except Exception as e:
        print(f"❌ Error clearing memory: {str(e)}")
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/documents', methods=['GET'])
def get_documents():
    """List all uploaded documents"""
    try:
        metadata = get_all_documents_metadata()
        documents = []
        for doc_id, info in metadata.items():
            documents.append({
                'document_id': doc_id,
                'filename': info.get('filename', 'Unknown'),
                'total_chunks': info.get('total_chunks', 0)
            })

        return jsonify({
            'documents': documents,
            'total': len(documents)
        }), 200

    except Exception as e:
        print(f"❌ Error fetching documents: {str(e)}")
        return jsonify({'error': str(e)}), 500