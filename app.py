from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# サーバー側に持たせるパスワード
CORRECT_PASSWORD = "numata2026"

# フロントエンドからパスワードを受け取って判定する
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user_password = data.get('password', '')

    if user_password == CORRECT_PASSWORD:
        return jsonify({"success": True, "message": "認証成功！"})
    else:
        return jsonify({"success": False, "message": "パスワードが違います。"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)