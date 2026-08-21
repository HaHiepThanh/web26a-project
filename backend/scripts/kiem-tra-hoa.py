#!/usr/bin/env python3
"""
Kiểm tra tự động toàn bộ endpoint phần của Hoà (Board, List, Label).

CÁCH CHẠY:
    cd backend
    npm run start:dev                  # cửa sổ terminal thứ nhất
    python3 scripts/kiem-tra-hoa.py    # cửa sổ thứ hai

Script tự tạo tổ chức + workspace riêng cho lần chạy này (qua endpoint của Huy),
chạy hết phép thử, rồi DỌN SẠCH. Chạy lại bao nhiêu lần cũng được.

Thẻ (card) là phần của Hoàng chưa xong, nên script tự chèn thẳng vào database
bằng service_role key để có dữ liệu test cho phần gắn nhãn.
"""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get('BASE_URL', 'http://localhost:3000')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G, R, Y, DIM, RS = '\033[32m', '\033[31m', '\033[33m', '\033[2m', '\033[0m'


def read_env(name):
    p = os.path.join(ROOT, '.env')
    if not os.path.exists(p):
        return None
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
    """Đi thẳng vào database — chỉ dùng để dựng/dọn dữ liệu, KHÔNG dùng để chấm."""
    url, key = read_env('SUPABASE_URL'), read_env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(url + '/rest/v1/' + path, method=method)
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=representation')
    if body is not None:
        req.data = json.dumps(body).encode()
    r = urllib.request.urlopen(req)
    return json.loads(r.read() or b'null')


PASS, FAIL = [], []


def check(code, desc, method, path, token, body, want, extra=None):
    """`want` là số, hoặc tuple nhiều mã cùng chấp nhận được."""
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

print(f'\n{Y}KIỂM TRA PHẦN CỦA HOÀ — Board, List, Label{RS}')
print(f'{DIM}{BASE}{RS}\n')

API_KEY = read_api_key()
if not API_KEY:
    print(f'{R}Không tìm thấy firebaseApiKey trong backend/postman/*.postman_environment.json{RS}\n')
    sys.exit(1)
if call('GET', '/health')[0] != 200:
    print(f'{R}Backend chưa sẵn sàng.{RS}\n')
    sys.exit(1)
print(f'{G}✔{RS} Backend đang chạy')

EMAIL_A, EMAIL_B = 'hocvien-a@test.dev', 'kiemtra-b@test.dev'
for e in (EMAIL_A, EMAIL_B):
    firebase('signUp', e)
ra, rb = firebase('signInWithPassword', EMAIL_A), firebase('signInWithPassword', EMAIL_B)
A, A_UID = ra['idToken'], ra['localId']
B, B_UID = rb['idToken'], rb['localId']
call('GET', '/auth/me', A)
call('GET', '/auth/me', B)
print(f'{G}✔{RS} A (chủ tổ chức): {EMAIL_A}')
print(f'{G}✔{RS} B (người ngoài): {EMAIL_B}')

STAMP = int(time.time())
NOPE = '00000000-0000-4000-8000-000000000999'

# Tổ chức + workspace của A (dùng endpoint của Huy — đã kiểm chứng 54/54)
orgA = call('POST', '/organizations', A, {'name': 'KT Hoà', 'slug': f'kt-hoa-{STAMP}'})[1]
OID = orgA['id']
WID = call('POST', '/workspaces', A, {'orgId': OID, 'name': 'WS kiểm tra'})[1]['id']

# Tổ chức + workspace của B — dùng cho phần bảo mật
orgB = call('POST', '/organizations', B, {'name': 'KT Hoà B', 'slug': f'kt-hoa-b-{STAMP}'})[1]
OID_B = orgB['id']
WID_B = call('POST', '/workspaces', B, {'orgId': OID_B, 'name': 'WS của B'})[1]['id']
print(f'{G}✔{RS} Đã dựng 2 tổ chức + 2 workspace để test')

# ------------------------------------------------------------------ 1. BOARD

section('1. BOARD — tạo, đọc, sửa')

board = check('1.1', 'tạo board', 'POST', '/boards', A, {'workspaceId': WID, 'name': 'Board KT'}, 201,
              lambda d: ('id' in (d or {}), 'có id'))
BID = board.get('id') if isinstance(board, dict) else None
if not BID:
    print(f'\n{R}Không tạo được board — dừng.{RS}\n')
    sys.exit(1)

assert_('1.2', 'board.orgId được điền tự động (không phải null)',
        bool(board.get('orgId')), f"orgId = {board.get('orgId')}")
assert_('1.2b', 'trả về camelCase, KHÔNG lẫn snake_case',
        not [k for k in (board or {}) if '_' in k],
        f"còn trường snake_case: {[k for k in (board or {}) if '_' in k]}")
assert_('1.3', "visibility mặc định = 'workspace'",
        board.get('visibility') == 'workspace', f"visibility = {board.get('visibility')}")

check('1.4', 'thiếu name → 400', 'POST', '/boards', A, {'workspaceId': WID}, 400)
check('1.5', 'workspaceId không tồn tại → 404', 'POST', '/boards', A,
      {'workspaceId': NOPE, 'name': 'X'}, 404)
check('1.6', 'B tạo board trong workspace của A → 403', 'POST', '/boards', B,
      {'workspaceId': WID, 'name': 'Trộm'}, 403)
check('1.7', 'không token → 401', 'POST', '/boards', None, {'workspaceId': WID, 'name': 'X'}, 401)

check('2.1', 'liệt kê board', 'GET', f'/boards?workspaceId={WID}', A, None, 200,
      lambda d: (any(b.get('id') == BID for b in (d or [])), 'có board vừa tạo'))
check('2.2', 'thiếu workspaceId → [] (không phải lỗi)', 'GET', '/boards', A, None, 200,
      lambda d: (d == [], f'trả về {json.dumps(d, ensure_ascii=False)[:60]}'))
check('2.3', 'B liệt kê board của A → 403', 'GET', f'/boards?workspaceId={WID}', B, None, 403)

check('3.1', 'xem chi tiết board', 'GET', f'/boards/{BID}', A, None, 200,
      lambda d: ((d or {}).get('id') == BID, 'đúng board'))
check('3.2', 'board không tồn tại → 404', 'GET', f'/boards/{NOPE}', A, None, 404)
check('3.3', 'B xem board của A → 404 (không phải 403)', 'GET', f'/boards/{BID}', B, None, 404)

check('4.1', 'đổi tên board', 'PATCH', f'/boards/{BID}', A, {'name': 'Board đổi tên'}, 200,
      lambda d: ((d or {}).get('name') == 'Board đổi tên', f"name = {(d or {}).get('name')}"))
check('4.2', 'đổi visibility', 'PATCH', f'/boards/{BID}', A, {'visibility': 'private'}, 200)
check('4.3', 'visibility sai giá trị → 400', 'PATCH', f'/boards/{BID}', A,
      {'visibility': 'sai-gia-tri'}, 400)
check('4.4', 'body rỗng → 400', 'PATCH', f'/boards/{BID}', A, {}, 400)
check('4.5', 'B sửa board của A → 404', 'PATCH', f'/boards/{BID}', B, {'name': 'X'}, 404)

# Sửa tên xong visibility có bị xoá mất không?
detail = call('GET', f'/boards/{BID}', A)[1]
assert_('4.6', 'sửa name KHÔNG làm mất visibility đã đặt',
        detail.get('visibility') == 'private', f"visibility = {detail.get('visibility')}")

# ------------------------------------------------------------------ 2. LIST

section('2. LIST — tạo, đọc, đổi tên, sắp thứ tự')

l1 = check('5.1', 'tạo cột 1', 'POST', '/lists', A, {'boardId': BID, 'name': 'Việc cần làm'}, 201,
           lambda d: ('position' in (d or {}) and 'boardId' in (d or {}),
                      f"cần position + boardId (camelCase), nhận {sorted((d or {}).keys())}"))
L1 = l1.get('id')
L2 = call('POST', '/lists', A, {'boardId': BID, 'name': 'Đang làm'})[1].get('id')
L3 = call('POST', '/lists', A, {'boardId': BID, 'name': 'Hoàn thành'})[1].get('id')
assert_('5.2', 'ba cột có position tăng dần',
        None not in (L1, L2, L3), 'tạo đủ 3 cột')

check('5.3', 'boardId không tồn tại → 404', 'POST', '/lists', A, {'boardId': NOPE, 'name': 'X'}, 404)
check('5.4', 'B tạo cột trong board của A → bị chặn', 'POST', '/lists', B,
      {'boardId': BID, 'name': 'Trộm'}, (403, 404))

lists = check('6.1', 'liệt kê cột', 'GET', f'/lists?boardId={BID}', A, None, 200,
              lambda d: (len(d or []) == 3, f'có {len(d or [])} cột, mong 3'))
pos = [l['position'] for l in lists] if isinstance(lists, list) else []
assert_('6.2', 'sắp xếp theo position TĂNG DẦN',
        pos == sorted(pos), f'position trả về: {pos}')

check('6.3', 'B liệt kê cột của A → bị chặn', 'GET', f'/lists?boardId={BID}', B, None, (403, 404))

check('7.1', 'đổi tên cột', 'PATCH', f'/lists/{L1}', A, {'name': 'Tên cột mới'}, 200,
      lambda d: ((d or {}).get('name') == 'Tên cột mới', f"name = {(d or {}).get('name')}"))
check('7.2', 'cột không tồn tại → 404', 'PATCH', f'/lists/{NOPE}', A, {'name': 'X'}, 404)

section('3. LIST — kéo thả đổi thứ tự (khó nhất)')

def order():
    d = call('GET', f'/lists?boardId={BID}', A)[1]
    return [l['name'] for l in d] if isinstance(d, list) else []

print(f'  {DIM}thứ tự ban đầu: {order()}{RS}')
check('8.1', 'kéo cột đầu xuống cuối (position 99)', 'PATCH', f'/lists/{L1}/position', A,
      {'position': 99}, 200)
o = order()
assert_('8.2', 'cột đó nằm CUỐI danh sách', o and o[-1] == 'Tên cột mới', f'thứ tự: {o}')

check('8.3', 'kéo về đầu (position 0)', 'PATCH', f'/lists/{L1}/position', A, {'position': 0}, 200)
o = order()
assert_('8.4', 'cột đó nằm ĐẦU danh sách', o and o[0] == 'Tên cột mới', f'thứ tự: {o}')

# Chèn vào giữa: KHÔNG gửi bừa 1.5. Phải đọc position thật của 2 cột còn lại rồi
# lấy trung bình — đó đúng là việc frontend làm khi người dùng thả chuột.
others = [l for l in call('GET', f'/lists?boardId={BID}', A)[1] if l['id'] != L1]
giua = (others[0]['position'] + others[1]['position']) / 2
check('8.5', f'chèn vào giữa (position {giua} — số thực)', 'PATCH', f'/lists/{L1}/position', A,
      {'position': giua}, 200)
o = order()
assert_('8.6', 'cột đó nằm GIỮA', len(o) == 3 and o[1] == 'Tên cột mới', f'thứ tự: {o}')

check('8.7', 'position không phải số → 400', 'PATCH', f'/lists/{L1}/position', A,
      {'position': 'khong-phai-so'}, 400)
check('8.8', 'B đổi thứ tự cột của A → 404', 'PATCH', f'/lists/{L1}/position', B,
      {'position': 5}, 404)

# ------------------------------------------------------------------ 3. LABEL

section('4. LABEL — tạo, liệt kê')

lb = check('9.1', 'tạo nhãn', 'POST', '/labels', A,
           {'boardId': BID, 'name': 'Gấp', 'color': '#ef4444'}, 201,
           lambda d: ('id' in (d or {}), 'có id'))
LB = lb.get('id') if isinstance(lb, dict) else None
assert_('9.2', 'label.orgId được điền tự động', bool((lb or {}).get('orgId')),
        f"orgId = {(lb or {}).get('orgId')}")

check('9.3', 'boardId không tồn tại → 404', 'POST', '/labels', A,
      {'boardId': NOPE, 'name': 'X', 'color': '#000000'}, 404)
check('9.4', 'B tạo nhãn trong board của A → bị chặn', 'POST', '/labels', B,
      {'boardId': BID, 'name': 'Trộm', 'color': '#000000'}, (403, 404))

check('10.1', 'liệt kê nhãn', 'GET', f'/labels?boardId={BID}', A, None, 200,
      lambda d: (any(x.get('id') == LB for x in (d or [])), 'có nhãn vừa tạo'))
check('10.2', 'B liệt kê nhãn của A → bị chặn', 'GET', f'/labels?boardId={BID}', B, None, (403, 404))

section('5. LABEL — gắn / gỡ khỏi thẻ')

# Card là phần của Hoàng chưa xong → chèn thẳng vào database để có dữ liệu test.
card = supabase('POST', 'cards', {
    'org_id': OID, 'list_id': L2, 'title': 'Thẻ để test nhãn',
    'position': 1, 'created_by': A_UID,
})[0]
CID = card['id']
print(f'  {DIM}đã chèn 1 thẻ test thẳng vào database (POST /cards là phần của Hoàng){RS}')

check('11.1', 'gắn nhãn vào thẻ', 'POST', f'/labels/cards/{CID}/{LB}', A, None, 201)
rows = supabase('GET', f'card_labels?select=card_id,label_id&card_id=eq.{CID}')
assert_('11.2', 'database có đúng 1 dòng card_labels', len(rows) == 1, f'có {len(rows)} dòng')

check('11.3', 'gắn lại lần 2 → không lỗi', 'POST', f'/labels/cards/{CID}/{LB}', A, None, 201)
rows = supabase('GET', f'card_labels?select=card_id&card_id=eq.{CID}')
assert_('11.4', 'gắn 2 lần VẪN chỉ 1 dòng (không nhân đôi)', len(rows) == 1, f'có {len(rows)} dòng')

# Nhãn của board KHÁC — phải bị chặn
bid2 = call('POST', '/boards', A, {'workspaceId': WID, 'name': 'Board 2'})[1]['id']
lb2 = call('POST', '/labels', A, {'boardId': bid2, 'name': 'Nhãn board 2', 'color': '#3b82f6'})[1]['id']
check('11.5', 'gắn nhãn của board KHÁC → 400', 'POST', f'/labels/cards/{CID}/{lb2}', A, None, 400)

check('11.6', 'nhãn không tồn tại → 404', 'POST', f'/labels/cards/{CID}/{NOPE}', A, None, 404)
check('11.7', 'thẻ không tồn tại → 404', 'POST', f'/labels/cards/{NOPE}/{LB}', A, None, 404)
check('11.8', 'B gắn nhãn của A → 404', 'POST', f'/labels/cards/{CID}/{LB}', B, None, 404)

check('12.1', 'gỡ nhãn', 'DELETE', f'/labels/cards/{CID}/{LB}', A, None, 200)
rows = supabase('GET', f'card_labels?select=card_id&card_id=eq.{CID}')
assert_('12.2', 'database không còn dòng nào', len(rows) == 0, f'còn {len(rows)} dòng')
check('12.3', 'gỡ nhãn chưa gắn → 404', 'DELETE', f'/labels/cards/{CID}/{LB}', A, None, 404)

# ------------------------------------------------------------------ 4. XOÁ

section('6. XOÁ cột và board')

check('13.1', 'xoá cột', 'DELETE', f'/lists/{L3}', A, None, 200)
check('13.2', 'xoá lần 2 → 404', 'DELETE', f'/lists/{L3}', A, None, 404)
check('13.3', 'B xoá cột của A → 404', 'DELETE', f'/lists/{L1}', B, None, 404)

check('14.1', 'CHỦ TỔ CHỨC xoá board của chính mình', 'DELETE', f'/boards/{bid2}', A, None, 200)
check('14.2', 'B xoá board của A → bị chặn', 'DELETE', f'/boards/{BID}', B, None, (403, 404))

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

# ------------------------------------------------------------------ kết quả

total = len(PASS) + len(FAIL)
print(f'\n{Y}{"═" * 64}{RS}')
if FAIL:
    print(f'{R}KẾT QUẢ: {len(PASS)}/{total} đạt — {len(FAIL)} phép thử KHÔNG ĐẠT{RS}\n')
    for code, desc, why, _ in FAIL:
        print(f'  {R}✘{RS} {code:6} {desc}')
        print(f'      {DIM}{why}{RS}')
    print()
    sys.exit(1)
print(f'{G}KẾT QUẢ: {total}/{total} ĐẠT — phần của Hoà hoạt động đúng.{RS}\n')
