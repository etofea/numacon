from flask import Flask, render_template, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CORRECT_USERNAME = "admin"
CORRECT_PASSWORD = "numata2026"

def check_auth(username, password):
    return username == CORRECT_USERNAME and password == CORRECT_PASSWORD

def authenticate():
    return Response(
        '管理者用の認証が必要です。\n', 401,
        {'WWW-Authenticate': 'Basic realm="Admin Area"'}
    )

def requires_auth(f):
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    decorated.__name__ = f.__name__
    return decorated

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
@requires_auth
def admin():
    return render_template('admin.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

    from flask import jsonify # ← 必要に応じてインポートに追加
import time

# AIチャット用のAPI
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')

    # テスト用2秒考えるフリ
    time.sleep(2)
    ai_reply = f"「{user_message}」についての回答です。（ここにAIの検索結果が入ります）"

    return jsonify({"reply": ai_reply})