#!/usr/bin/env python3
"""
Kiểm tra tự động toàn bộ endpoint phần của Hoàng (Card, Comment, Chat, Activity).

CÁCH CHẠY:
    cd backend
    npm run start:dev                    # cửa sổ terminal thứ nhất
    python3 scripts/kiem-tra-hoang.py    # cửa sổ thứ hai

Script tự dựng tổ chức + workspace + board + cột riêng cho lần chạy này (qua
endpoint của Huy và Hoà — đều đã kiểm chứng), chạy hết phép thử rồi DỌN SẠCH.
"""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get('BASE_URL', 'http://localhost:3000')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G, R, Y, DIM, RS = '\033[32m', '\033[31m', '\033[33m', '\033[2m', '\033[0m'


def read_env(name):
    p = os.path.join(ROOT, '.env')
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == name:
            return v.strip().strip('"').strip("'")
    return None


def read_api_key():
    d = os.path.join(ROOT, 'postman')
    for f in sorted(os.listdir(d)):
        if f.endswith('.postman_environment.json'):
            for v in json.load(open(os.path.join(d, f), encoding='utf-8'))['values']:
                if v['key'] == 'firebaseApiKey' and v.get('value'):
                    return v['value']
    return None


def firebase(op, email, pw='Passw0rd!'):
    u = f'https://identitytoolkit.googleapis.com/v1/accounts:{op}?key={API_KEY}'
    body = json.dumps({'email': email, 'password': pw, 'returnSecureToken': True}).encode()
    req = urllib.request.Request(u, data=body, headers={'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {'error': json.load(e)['error']['message']}


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'null')
        except Exception:
            return e.code, None
    except urllib.error.URLError:
        print(f'\n{R}Không kết nối được {BASE} — backend chưa chạy?{RS}\n')
        sys.exit(1)


def supabase(method, path, body=None):
    """Đi thẳng database — chỉ để dựng/dọn dữ liệu, KHÔNG dùng để chấm."""
    url, key = read_env('SUPABASE_URL'), read_env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(url + '/rest/v1/' + path, method=method)
    for k, v in {'apikey': key, 'Authorization': f'Bearer {key}',
                 'Content-Type': 'application/json', 'Prefer': 'return=representation'}.items():
        req.add_header(k, v)
    if body is not None:
        req.data = json.dumps(body).encode()
    return json.loads(urllib.request.urlopen(req).read() or b'null')


PASS, FAIL = [], []


def check(code, desc, method, path, token, body, want, extra=None):
    st, data = call(method, path, token, body)
    accepted = want if isinstance(want, tuple) else (want,)
    ok = st in accepted
    why = f'nhận {st}, mong {" hoặc ".join(map(str, accepted))}'
    if ok and extra:
        ok, why = extra(data)
    (PASS if ok else FAIL).append((code, desc, why, data))
    print(f'  {(G + "✔" + RS) if ok else (R + "✘" + RS)} {code:6} {desc:54} {DIM}{st}{RS}')
    if not ok:
        print(f'      {R}→ {why}{RS}')
        print(f'      {DIM}{json.dumps(data, ensure_ascii=False)[:170]}{RS}')
    return data


def assert_(code, desc, cond, why):
    (PASS if cond else FAIL).append((code, desc, why, None))
    print(f'  {(G + "✔" + RS) if cond else (R + "✘" + RS)} {code:6} {desc:54} {DIM}—{RS}')
    if not cond:
        print(f'      {R}→ {why}{RS}')


def section(t):
    print(f'\n{Y}── {t} {"─" * max(0, 58 - len(t))}{RS}')


# ------------------------------------------------------------------ chuẩn bị

print(f'\n{Y}KIỂM TRA PHẦN CỦA HOÀNG — Card, Comment, Chat, Activity{RS}')
print(f'{DIM}{BASE}{RS}\n')

API_KEY = read_api_key()
if not API_KEY or call('GET', '/health')[0] != 200:
    print(f'{R}Thiếu firebaseApiKey hoặc backend chưa chạy.{RS}\n')
    sys.exit(1)
print(f'{G}✔{RS} Backend đang chạy')

for e in ('hocvien-a@test.dev', 'kiemtra-b@test.dev'):
    firebase('signUp', e)
ra, rb = firebase('signInWithPassword', 'hocvien-a@test.dev'), firebase('signInWithPassword', 'kiemtra-b@test.dev')
A, A_UID = ra['idToken'], ra['localId']
B, B_UID = rb['idToken'], rb['localId']
call('GET', '/auth/me', A)
call('GET', '/auth/me', B)
print(f'{G}✔{RS} A (chủ tổ chức) · B (người ngoài)')

STAMP = int(time.time())
NOPE = '00000000-0000-4000-8000-000000000999'

OID = call('POST', '/organizations', A, {'name': 'KT Hoàng', 'slug': f'kt-hoang-{STAMP}'})[1]['id']
WID = call('POST', '/workspaces', A, {'orgId': OID, 'name': 'WS'})[1]['id']
BID = call('POST', '/boards', A, {'workspaceId': WID, 'name': 'Board KT'})[1]['id']
L1 = call('POST', '/lists', A, {'boardId': BID, 'name': 'Việc cần làm'})[1]['id']
L2 = call('POST', '/lists', A, {'boardId': BID, 'name': 'Đang làm'})[1]['id']
L3 = call('POST', '/lists', A, {'boardId': BID, 'name': 'Hoàn thành'})[1]['id']

# Tổ chức riêng của B — dùng cho phần bảo mật
OID_B = call('POST', '/organizations', B, {'name': 'KT B', 'slug': f'kt-hoang-b-{STAMP}'})[1]['id']
WID_B = call('POST', '/workspaces', B, {'orgId': OID_B, 'name': 'WSB'})[1]['id']
BID_B = call('POST', '/boards', B, {'workspaceId': WID_B, 'name': 'Board của B'})[1]['id']
L_B = call('POST', '/lists', B, {'boardId': BID_B, 'name': 'Cột của B'})[1]['id']
print(f'{G}✔{RS} Đã dựng 2 tổ chức + board + cột để test')

# ------------------------------------------------------------------ CARD

section('1. CARD — tạo, đọc')

card = check('1.1', 'tạo thẻ', 'POST', '/cards', A, {'listId': L1, 'title': 'Thẻ KT'}, 201,
             lambda d: ('id' in (d or {}), 'có id'))
CID = card.get('id') if isinstance(card, dict) else None
if not CID:
    print(f'\n{R}Không tạo được thẻ — dừng.{RS}\n')
    sys.exit(1)

assert_('1.2', 'card.orgId được điền tự động', bool(card.get('orgId')), f"orgId = {card.get('orgId')}")
assert_('1.3', "priority mặc định = 'medium'", card.get('priority') == 'medium', f"priority = {card.get('priority')}")
assert_('1.4', 'trả camelCase, KHÔNG lẫn snake_case',
        not [k for k in (card or {}) if '_' in k], f"còn: {[k for k in (card or {}) if '_' in k]}")

check('1.5', 'thiếu title → 400', 'POST', '/cards', A, {'listId': L1}, 400)
check('1.6', 'listId không tồn tại → 404', 'POST', '/cards', A, {'listId': NOPE, 'title': 'X'}, 404)
check('1.7', 'B tạo thẻ trong cột của A → bị chặn', 'POST', '/cards', B,
      {'listId': L1, 'title': 'Trộm'}, (403, 404))
check('1.8', 'không token → 401', 'POST', '/cards', None, {'listId': L1, 'title': 'X'}, 401)

check('2.1', 'liệt kê thẻ của board', 'GET', f'/cards?boardId={BID}', A, None, 200,
      lambda d: (any(c.get('id') == CID for c in (d or [])), 'có thẻ vừa tạo'))
check('2.2', 'thiếu boardId → [] (không phải lỗi)', 'GET', '/cards', A, None, 200,
      lambda d: (d == [], f'trả về {json.dumps(d, ensure_ascii=False)[:50]}'))
check('2.3', '🔒 B đọc thẻ của A → bị chặn', 'GET', f'/cards?boardId={BID}', B, None, (403, 404))

section('2. CARD — sửa, xoá')

check('3.1', 'sửa tiêu đề', 'PATCH', f'/cards/{CID}', A, {'title': 'Tiêu đề mới'}, 200,
      lambda d: ((d or {}).get('title') == 'Tiêu đề mới', f"title = {(d or {}).get('title')}"))
check('3.2', 'đổi mức ưu tiên', 'PATCH', f'/cards/{CID}', A, {'priority': 'high'}, 200)
check('3.3', 'priority sai giá trị → 400', 'PATCH', f'/cards/{CID}', A, {'priority': 'urgent'}, 400)
check('3.4', 'body rỗng → 400', 'PATCH', f'/cards/{CID}', A, {}, 400)
check('3.5', 'thẻ không tồn tại → 404', 'PATCH', f'/cards/{NOPE}', A, {'title': 'X'}, 404)
check('3.6', '🔒 B sửa thẻ của A → bị chặn', 'PATCH', f'/cards/{CID}', B, {'title': 'Trộm'}, (403, 404))

detail = [c for c in call('GET', f'/cards?boardId={BID}', A)[1] if c['id'] == CID][0]
assert_('3.7', 'sửa title KHÔNG làm mất priority đã đặt',
        detail.get('priority') == 'high', f"priority = {detail.get('priority')}")

section('3. CARD — kéo thả (khó nhất)')

def list_of(cid):
    rows = call('GET', f'/cards?boardId={BID}', A)[1]
    row = [c for c in rows if c['id'] == cid]
    return row[0]['listId'] if row else None

check('4.1', 'chuyển thẻ sang cột khác', 'PATCH', f'/cards/{CID}/move', A,
      {'toListId': L2, 'position': 1}, 200)
assert_('4.2', 'thẻ đã nằm ở cột mới', list_of(CID) == L2, f'listId = {list_of(CID)}')

check('4.3', 'chuyển vào cột đang RỖNG', 'PATCH', f'/cards/{CID}/move', A,
      {'toListId': L3, 'position': 1}, 200)
assert_('4.4', 'thẻ đã nằm ở cột rỗng', list_of(CID) == L3, f'listId = {list_of(CID)}')

check('4.5', 'chèn giữa 2 thẻ (position số thực)', 'PATCH', f'/cards/{CID}/move', A,
      {'toListId': L1, 'position': 1.5}, 200)
check('4.6', 'cột đích không tồn tại → 404', 'PATCH', f'/cards/{CID}/move', A,
      {'toListId': NOPE, 'position': 1}, 404)
check('4.7', '🔒 chuyển thẻ sang cột của TỔ CHỨC KHÁC → 403', 'PATCH', f'/cards/{CID}/move', A,
      {'toListId': L_B, 'position': 1}, 403)
check('4.8', '🔒 B chuyển thẻ của A → bị chặn', 'PATCH', f'/cards/{CID}/move', B,
      {'toListId': L2, 'position': 1}, (403, 404))

# ------------------------------------------------------------------ COMMENT

section('4. COMMENT')

cm = check('5.1', 'thêm bình luận', 'POST', '/comments', A, {'cardId': CID, 'content': 'Bình luận A'}, 201,
           lambda d: ('id' in (d or {}), 'có id'))
CMID = cm.get('id') if isinstance(cm, dict) else None

check('5.2', 'nội dung rỗng → 400', 'POST', '/comments', A, {'cardId': CID, 'content': ''}, 400)
check('5.3', 'cardId không tồn tại → 404', 'POST', '/comments', A, {'cardId': NOPE, 'content': 'x'}, 404)
check('5.4', '🔒 B bình luận vào thẻ của A → bị chặn', 'POST', '/comments', B,
      {'cardId': CID, 'content': 'Trộm'}, (403, 404))

check('6.1', 'đọc bình luận của thẻ', 'GET', f'/comments?cardId={CID}', A, None, 200,
      lambda d: (len(d or []) >= 1 and 'user' in d[0] and 'userId' in d[0]
                 and (d[0]['user'] is None or 'displayName' in d[0]['user']),
                 'phải có userId + khối "user" camelCase (displayName/avatarUrl)'))
check('6.2', '🔒 B đọc bình luận thẻ của A → bị chặn', 'GET', f'/comments?cardId={CID}', B, None, (403, 404))

# B bình luận trên thẻ CỦA B, rồi A thử xoá → phải 403
cid_b = call('POST', '/cards', B, {'listId': L_B, 'title': 'Thẻ của B'})[1]['id']
cm_b = call('POST', '/comments', B, {'cardId': cid_b, 'content': 'Của B'})[1]['id']
check('7.1', '🔒 A xoá bình luận của B → 403/404', 'DELETE', f'/comments/{cm_b}', A, None, (403, 404))
check('7.2', 'tác giả tự xoá bình luận của mình', 'DELETE', f'/comments/{CMID}', A, None, 200)
check('7.3', 'xoá lần 2 → 404', 'DELETE', f'/comments/{CMID}', A, None, 404)

# ------------------------------------------------------------------ CHAT

section('5. CHAT')

check('8.1', 'gửi tin nhắn', 'POST', '/chat', A, {'boardId': BID, 'content': 'Xin chào cả nhóm'}, 201,
      lambda d: ('id' in (d or {}), 'có id'))
check('8.2', 'nội dung rỗng → 400', 'POST', '/chat', A, {'boardId': BID, 'content': ''}, 400)
check('8.3', 'boardId không tồn tại → 404', 'POST', '/chat', A, {'boardId': NOPE, 'content': 'x'}, 404)
check('8.4', '🔒 B gửi tin vào board của A → bị chặn', 'POST', '/chat', B,
      {'boardId': BID, 'content': 'Trộm'}, (403, 404))

check('9.1', 'đọc lịch sử chat', 'GET', f'/chat?boardId={BID}', A, None, 200,
      lambda d: (len(d or []) >= 1 and 'user' in d[0] and 'userId' in d[0]
                 and (d[0]['user'] is None or 'displayName' in d[0]['user']),
                 'phải có userId + khối "user" camelCase'))
check('9.2', 'sắp xếp cũ → mới', 'GET', f'/chat?boardId={BID}', A, None, 200,
      lambda d: (all((d or [])[i]['createdAt'] <= (d or [])[i + 1]['createdAt'] for i in range(len(d or []) - 1)),
                 'createdAt phải tăng dần'))
check('9.3', '🔒 B đọc chat của A → bị chặn', 'GET', f'/chat?boardId={BID}', B, None, (403, 404))

# ------------------------------------------------------------------ ACTIVITY

section('6. ACTIVITY (bonus)')

logs = check('10.1', 'đọc nhật ký hoạt động', 'GET', f'/activity?boardId={BID}', A, None, 200,
             lambda d: (isinstance(d, list), 'trả về mảng'))
loai = {l.get('actionType') for l in (logs or []) if isinstance(l, dict)}
assert_('10.2', 'có ghi log khi TẠO thẻ', 'card_created' in loai, f'các loại ghi được: {sorted(loai)}')
assert_('10.3', 'có ghi log khi CHUYỂN thẻ', 'card_moved' in loai, f'các loại ghi được: {sorted(loai)}')
assert_('10.4', 'có ghi log khi THÊM bình luận', 'comment_added' in loai, f'các loại ghi được: {sorted(loai)}')
assert_('10.5', 'nhật ký trả camelCase',
        not [k for k in ((logs or [{}])[0] if logs else {}) if '_' in k],
        f"còn snake_case: {[k for k in ((logs or [{}])[0] if logs else {}) if '_' in k]}")
check('10.6', '🔒 B đọc nhật ký board của A → bị chặn', 'GET', f'/activity?boardId={BID}', B, None, (403, 404))

# ------------------------------------------------------------------ XOÁ THẺ

section('7. XOÁ THẺ')

check('11.1', '🔒 B xoá thẻ của A → bị chặn', 'DELETE', f'/cards/{CID}', B, None, (403, 404))
check('11.2', 'A xoá thẻ của mình', 'DELETE', f'/cards/{CID}', A, None, 200)
check('11.3', 'xoá lần 2 → 404', 'DELETE', f'/cards/{CID}', A, None, 404)
check('11.4', 'id sai định dạng uuid → 404 (không phải 500)', 'DELETE', '/cards/khong-phai-uuid', A, None, 404)

# ------------------------------------------------------------------ dọn dẹp

section('Dọn dẹp')
n = 0
for oid in (OID, OID_B):
    try:
        supabase('DELETE', f'organizations?id=eq.{oid}')
        n += 1
    except Exception as e:
        print(f'  {Y}!{RS} không xoá được {oid}: {e}')
print(f'  {G}✔{RS} đã xoá {n} tổ chức test')

total = len(PASS) + len(FAIL)
print(f'\n{Y}{"═" * 64}{RS}')
if FAIL:
    print(f'{R}KẾT QUẢ: {len(PASS)}/{total} đạt — {len(FAIL)} phép thử KHÔNG ĐẠT{RS}\n')
    for code, desc, why, _ in FAIL:
        print(f'  {R}✘{RS} {code:6} {desc}')
        print(f'      {DIM}{why}{RS}')
    print()
    sys.exit(1)
print(f'{G}KẾT QUẢ: {total}/{total} ĐẠT — phần của Hoàng hoạt động đúng.{RS}\n')
