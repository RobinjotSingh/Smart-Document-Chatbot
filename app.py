from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from datetime import datetime

# 🌍 Load environment variables
load_dotenv()


# 📦 Import routes

from routes.upload import upload_bp
from routes.chat import chat_bp

# ⚙️ Initialize Flask app

app = Flask(__name__)

# 🌐 CORS Configuration

# In production, replace "*" with your actual frontend URL (e.g. http://localhost:3000)
CORS(
    app,
    resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "*")}},
    supports_credentials=True,
    expose_headers=["Content-Type"],
    methods=["GET", "POST", "DELETE", "OPTIONS"],  # 👈 Added DELETE here
)

# Ensure browser gets proper CORS headers even on error responses
@app.after_request
def _add_cors_headers(response):
    response.headers.setdefault("Access-Control-Allow-Origin", os.getenv("FRONTEND_ORIGIN", "*"))
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")  # 👈 Added DELETE here
    return response


# 🔗 Register Blueprints (API routes)

app.register_blueprint(upload_bp, url_prefix="/api/upload")
app.register_blueprint(chat_bp, url_prefix="/api/chat")


# 📂 Ensure required folders exist

os.makedirs("uploads", exist_ok=True)
os.makedirs("vector_db", exist_ok=True)

# 💓 Health Check Endpoint

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "OK",
        "message": "PDF Chatbot Backend is running (Python/Flask + OpenAI)",
        "timestamp": datetime.now().isoformat(),
        "model": os.getenv("CHAT_MODEL", "gpt-4o-mini"),
        "embedding_model": os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
    })

# ⚠️ Global Error Handlers

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

# 🚀 Run Flask Server

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))

    print("\n" + "=" * 60)
    print("🚀 PDF CHATBOT BACKEND SERVER")
    print("=" * 60)
    print(f"📡 Server running on: http://localhost:{port}")
    print(f"🤖 Chat Model: {os.getenv('CHAT_MODEL', 'gpt-4o-mini')}")
    print(f"🔢 Embedding Model: {os.getenv('EMBEDDING_MODEL', 'text-embedding-3-large')}")
    print("\n📚 API Endpoints:")
    print(f"   POST http://localhost:{port}/api/upload  (accepts both /api/upload and /api/upload/)")
    print(f"   DELETE http://localhost:{port}/api/upload/<document_id>  (delete document)")
    print(f"   POST http://localhost:{port}/api/chat    (chat with uploaded document)")
    print(f"   GET  http://localhost:{port}/api/chat/documents")
    print(f"   GET  http://localhost:{port}/api/health")
    print("=" * 60 + "\n")

    app.run(debug=True, port=port, host="0.0.0.0")
