# services/chat_memory.py

from collections import defaultdict

# simple in-memory store { session_id: [ {role, content}, ... ] }
_memory_store = defaultdict(list)

def get_chat_history(session_id):
    """Retrieve chat history for a session"""
    return _memory_store.get(session_id, [])

def append_to_history(session_id, role, content):
    """Add a message to the session memory"""
    _memory_store[session_id].append({"role": role, "content": content})
    # keep memory short (last 10 messages)
    _memory_store[session_id] = _memory_store[session_id][-10:]

def clear_chat_history(session_id):
    """Clear a session's memory"""
    if session_id in _memory_store:
        del _memory_store[session_id]
