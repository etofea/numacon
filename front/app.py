# =========================================================
# 1. 必要なライブラリの読み込み
# =========================================================
import json

from flask import Flask, render_template, request, Response, jsonify
from flask_cors import CORS
import time
import os
import requests

# Flaskアプリの本体を作成
app = Flask(__name__)
# 異なるURLやポートからの通信を許可する設定
CORS(app)

# =========================================================
# 2. 管理者画面用のBasic認証
# =========================================================
CORRECT_USERNAME = "admin"
CORRECT_PASSWORD = "numata2026"

# IDとパスワードが正しいかチェックする関数
def check_auth(username, password):
    return username == CORRECT_USERNAME and password == CORRECT_PASSWORD

# 失敗したときログイン窓を出すための関数
def authenticate():
    return Response(
        '管理者用の認証が必要です。\n', 401,
        {'WWW-Authenticate': 'Basic realm="Admin Area"'}
    )

# ログインを要求する仕組み
def requires_auth(f):
    def decorated(*args, **kwargs):
        auth = request.authorization
        # 間違っていたらログイン窓を出す
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    decorated.__name__ = f.__name__
    return decorated

# =========================================================
# 3. 画面の表示（ルーティング）
# =========================================================
# トップページにアクセスされたとき
@app.route('/')
def index():
    # 一般向け画面を表示
    return render_template('index.html')

# 管理者ページにアクセスされたとき
@app.route('/admin')
@requires_auth
def admin():
    # 認証を通過したら管理者画面を表示
    return render_template('admin.html')

# =========================================================
# 4. AIチャット用
# =========================================================
# 質問が送信されたときに動く処理

BACKEND_URL = os.environ.get("BACKEND_URL", "http://backend:4000")

@app.route('/api/chat', methods=['POST'])
def chat():
    # jsから送られてきたJSONデータを受け取る
    data = request.get_json()

    try:
        Response = requests.post(f"{BACKEND_URL}/api/chat", json=data, timeout=10)
        return jsonify(Response.json()), Response.status_code
    except Exception as e:
        print(f"failed backed communication: error occurred : {e}")
        return jsonify({"reply": f"failed backedn communicatyion error: {e}"})


# =========================================================
# 5. サーバーの起動
# =========================================================
# このファイルが直接実行されたときだけサーバーを立ち上げる
if __name__ == '__main__':
    # debug=Trueにするとコードを書き換えたときに自動でサーバーが再起動する
    app.run(host='0.0.0.0', port=5000, debug=True)